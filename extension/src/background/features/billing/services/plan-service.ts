import { getBillingSubscription } from 'shared/firestore-service';
import { createUserPlanSnapshot, type UserPlanSnapshot } from 'shared/plans';

const PLAN_CACHE_TTL_MS = 30_000;

interface CachedPlan {
  expiresAt: number;
  value: UserPlanSnapshot;
}

const planCache = new Map<string, CachedPlan>();
const pendingReads = new Map<string, Promise<UserPlanSnapshot>>();

export async function getUserPlanSnapshot(
  userId: string,
  options: { force?: boolean } = {}
): Promise<UserPlanSnapshot> {
  const now = Date.now();
  const cached = planCache.get(userId);
  if (!options.force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = pendingReads.get(userId);
  if (!options.force && pending) {
    return pending;
  }

  const readPromise = getBillingSubscription(userId)
    .then(createUserPlanSnapshot)
    .catch((error) => {
      console.warn('[plan] Subscription lookup failed; applying Free entitlements', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return createUserPlanSnapshot(null);
    })
    .then((value) => {
      planCache.set(userId, {
        expiresAt: Date.now() + PLAN_CACHE_TTL_MS,
        value,
      });
      return value;
    })
    .finally(() => {
      if (pendingReads.get(userId) === readPromise) {
        pendingReads.delete(userId);
      }
    });

  pendingReads.set(userId, readPromise);
  return readPromise;
}

export function clearUserPlanCache(userId?: string): void {
  if (userId) {
    planCache.delete(userId);
    pendingReads.delete(userId);
    return;
  }

  planCache.clear();
  pendingReads.clear();
}
