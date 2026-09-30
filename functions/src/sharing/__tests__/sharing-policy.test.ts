import { describe, expect, it } from 'vitest';
import { findSharingLimitViolation } from '../sharing-policy.js';
import type { SharingUsage } from '../types.js';

function usage(overrides: Partial<SharingUsage> = {}): SharingUsage {
  return {
    outgoingRecipientCount: 0,
    outgoingFeedCount: 0,
    incomingOwnerCount: 0,
    incomingFeedCount: 0,
    initializedAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('sharing limits', () => {
  it('allows a Free pair to share three feeds with the same person', () => {
    expect(
      findSharingLimitViolation({
        ownerIsPro: false,
        recipientIsPro: false,
        pairFeedCount: 2,
        feedRecipientCount: 1,
        ownerUsage: usage({ outgoingRecipientCount: 1, outgoingFeedCount: 2 }),
        recipientUsage: usage({ incomingOwnerCount: 1, incomingFeedCount: 2 }),
        actorIsOwner: true,
      })
    ).toBeNull();
  });

  it('blocks a second recipient for a Free owner', () => {
    expect(
      findSharingLimitViolation({
        ownerIsPro: false,
        recipientIsPro: true,
        pairFeedCount: 0,
        feedRecipientCount: 0,
        ownerUsage: usage({ outgoingRecipientCount: 1 }),
        recipientUsage: usage(),
        actorIsOwner: true,
      })
    ).toEqual({ direction: 'outgoing', dimension: 'people', limit: 1 });
  });

  it('reports the Free recipient limit to a Pro owner', () => {
    expect(
      findSharingLimitViolation({
        ownerIsPro: true,
        recipientIsPro: false,
        pairFeedCount: 0,
        feedRecipientCount: 0,
        ownerUsage: usage(),
        recipientUsage: usage({ incomingOwnerCount: 1 }),
        actorIsOwner: true,
      })
    ).toEqual({ direction: 'incoming', dimension: 'people', limit: 1 });
  });

  it('prioritizes the link opener own incoming limit', () => {
    expect(
      findSharingLimitViolation({
        ownerIsPro: false,
        recipientIsPro: false,
        pairFeedCount: 0,
        feedRecipientCount: 0,
        ownerUsage: usage({ outgoingRecipientCount: 1 }),
        recipientUsage: usage({ incomingFeedCount: 3 }),
        actorIsOwner: false,
      })
    ).toEqual({ direction: 'incoming', dimension: 'feeds', limit: 3 });
  });

  it('does not limit Pro-to-Pro sharing', () => {
    expect(
      findSharingLimitViolation({
        ownerIsPro: true,
        recipientIsPro: true,
        pairFeedCount: 0,
        feedRecipientCount: 0,
        ownerUsage: usage({ outgoingRecipientCount: 9, outgoingFeedCount: 20 }),
        recipientUsage: usage({ incomingOwnerCount: 8, incomingFeedCount: 30 }),
        actorIsOwner: true,
      })
    ).toBeNull();
  });
});
