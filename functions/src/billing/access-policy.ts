export interface SubscriptionAccessData {
  plan?: unknown;
  status?: unknown;
  endsAt?: unknown;
  currentPeriodEnd?: unknown;
  providerUpdatedAt?: unknown;
  updatedAt?: unknown;
}

export function hasCurrentProAccess(data: SubscriptionAccessData | undefined, now = Date.now()): boolean {
  if (data?.plan !== 'pro') return false;
  if (data.status === 'active' || data.status === 'past_due') return true;

  const paidUntil = typeof data.endsAt === 'number' ? data.endsAt : data.currentPeriodEnd;
  return data.status === 'cancelled' && typeof paidUntil === 'number' && paidUntil > now;
}

function getUpdateTime(data: SubscriptionAccessData): number {
  if (typeof data.providerUpdatedAt === 'number') return data.providerUpdatedAt;
  return typeof data.updatedAt === 'number' ? data.updatedAt : 0;
}

function getAccessPriority(data: SubscriptionAccessData, now: number): number {
  if (!hasCurrentProAccess(data, now)) return 0;
  if (data.status === 'active') return 3;
  if (data.status === 'past_due') return 2;
  return 1;
}

export function selectEntitlementSubscription<T extends SubscriptionAccessData>(
  subscriptions: readonly T[],
  now = Date.now()
): T | null {
  if (subscriptions.length === 0) return null;

  return [...subscriptions].sort((left, right) => {
    const accessDifference = getAccessPriority(right, now) - getAccessPriority(left, now);
    return accessDifference || getUpdateTime(right) - getUpdateTime(left);
  })[0];
}
