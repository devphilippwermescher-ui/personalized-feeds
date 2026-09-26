import { hasCurrentProAccess, type SubscriptionAccessData } from '../billing/access-policy.js';

export function hasProSharingAccess(data: SubscriptionAccessData | undefined, now = Date.now()): boolean {
  return hasCurrentProAccess(data, now);
}
