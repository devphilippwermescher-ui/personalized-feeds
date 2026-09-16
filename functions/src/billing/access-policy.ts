interface SubscriptionAccessData {
  plan?: unknown;
  status?: unknown;
  endsAt?: unknown;
  currentPeriodEnd?: unknown;
}

export function hasCurrentProAccess(data: SubscriptionAccessData | undefined, now = Date.now()): boolean {
  if (data?.plan !== 'pro') return false;
  if (data.status === 'active' || data.status === 'past_due') return true;

  const paidUntil = typeof data.endsAt === 'number' ? data.endsAt : data.currentPeriodEnd;
  return data.status === 'cancelled' && typeof paidUntil === 'number' && paidUntil > now;
}
