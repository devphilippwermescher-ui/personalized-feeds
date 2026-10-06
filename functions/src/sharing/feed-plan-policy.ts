import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { hasCurrentProAccess } from '../billing/access-policy.js';

const FREE_FEED_LIMIT = 3;
const FREE_MEMBER_LIMIT = 10;

export interface FeedPlanPolicyRequest {
  ownerId: string;
  feedId: string;
}

export interface FeedPlanPolicyResult {
  ownerPlan: 'free' | 'pro';
  isFeedLocked: boolean;
  maxMembersPerFeed: number | null;
}

export function createFeedPlanPolicy(
  ownerPlan: 'free' | 'pro',
  orderedFeedIds: readonly string[],
  feedId: string
): FeedPlanPolicyResult | null {
  const feedIndex = orderedFeedIds.indexOf(feedId);
  if (feedIndex < 0) return null;
  return {
    ownerPlan,
    isFeedLocked: ownerPlan === 'free' && feedIndex >= FREE_FEED_LIMIT,
    maxMembersPerFeed: ownerPlan === 'free' ? FREE_MEMBER_LIMIT : null,
  };
}

function policyKey(ownerId: string, feedId: string): string {
  return `${ownerId}/${feedId}`;
}

function numericField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export async function getAuthorizedFeedPlanPolicies(
  db: Firestore,
  authenticatedUserId: string,
  requests: FeedPlanPolicyRequest[]
): Promise<Record<string, FeedPlanPolicyResult>> {
  const uniqueRequests = [
    ...new Map(requests.map((request) => [policyKey(request.ownerId, request.feedId), request])).values(),
  ];
  if (uniqueRequests.length === 0 || uniqueRequests.length > 100) {
    throw new HttpsError('invalid-argument', 'Request between 1 and 100 feed policies.');
  }

  const ownerIds = [...new Set(uniqueRequests.map((request) => request.ownerId))];
  const ownerState = new Map<string, { plan: 'free' | 'pro'; orderedFeedIds: string[] }>();

  await Promise.all(
    ownerIds.map(async (ownerId) => {
      const [subscriptionSnapshot, feedsSnapshot] = await Promise.all([
        db.doc(`users/${ownerId}/billing/subscription`).get(),
        db.collection(`users/${ownerId}/feeds`).get(),
      ]);
      const plan = hasCurrentProAccess(subscriptionSnapshot.data()) ? 'pro' : 'free';
      const orderedFeedIds = feedsSnapshot.docs
        .map((document) => ({
          id: document.id,
          sortOrder: numericField(document.get('sortOrder'), Number.MAX_SAFE_INTEGER),
          createdAt: numericField(document.get('createdAt'), 0),
        }))
        .sort((left, right) => left.sortOrder - right.sortOrder || right.createdAt - left.createdAt)
        .map((feed) => feed.id);
      ownerState.set(ownerId, { plan, orderedFeedIds });
    })
  );

  const policies: Record<string, FeedPlanPolicyResult> = {};
  await Promise.all(
    uniqueRequests.map(async ({ ownerId, feedId }) => {
      const state = ownerState.get(ownerId);
      const feedIndex = state?.orderedFeedIds.indexOf(feedId) ?? -1;
      if (!state || feedIndex < 0) {
        throw new HttpsError('not-found', 'Feed not found.');
      }

      if (ownerId !== authenticatedUserId) {
        const share = await db.doc(`users/${ownerId}/feeds/${feedId}/shares/${authenticatedUserId}`).get();
        if (!share.exists) {
          throw new HttpsError('permission-denied', 'You no longer have access to this feed.');
        }
      }

      const policy = createFeedPlanPolicy(state.plan, state.orderedFeedIds, feedId);
      if (!policy) throw new HttpsError('not-found', 'Feed not found.');
      policies[policyKey(ownerId, feedId)] = policy;
    })
  );

  return policies;
}
