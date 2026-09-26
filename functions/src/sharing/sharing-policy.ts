import type { LimitDimension, LimitDirection, SharingUsage } from './types.js';

export interface SharingLimitViolation {
  direction: LimitDirection;
  dimension: LimitDimension;
  limit: 1 | 3;
}

export function findSharingLimitViolation(params: {
  ownerIsPro: boolean;
  recipientIsPro: boolean;
  pairFeedCount: number;
  feedRecipientCount: number;
  ownerUsage: SharingUsage;
  recipientUsage: SharingUsage;
  actorIsOwner: boolean;
}): SharingLimitViolation | null {
  const outgoing: SharingLimitViolation[] = [];
  const incoming: SharingLimitViolation[] = [];

  if (!params.ownerIsPro && params.pairFeedCount === 0 && params.ownerUsage.outgoingRecipientCount >= 1) {
    outgoing.push({ direction: 'outgoing', dimension: 'people', limit: 1 });
  }
  if (!params.ownerIsPro && params.feedRecipientCount === 0 && params.ownerUsage.outgoingFeedCount >= 3) {
    outgoing.push({ direction: 'outgoing', dimension: 'feeds', limit: 3 });
  }
  if (!params.recipientIsPro && params.pairFeedCount === 0 && params.recipientUsage.incomingOwnerCount >= 1) {
    incoming.push({ direction: 'incoming', dimension: 'people', limit: 1 });
  }
  if (!params.recipientIsPro && params.recipientUsage.incomingFeedCount >= 3) {
    incoming.push({ direction: 'incoming', dimension: 'feeds', limit: 3 });
  }

  return params.actorIsOwner ? (outgoing[0] ?? incoming[0] ?? null) : (incoming[0] ?? outgoing[0] ?? null);
}
