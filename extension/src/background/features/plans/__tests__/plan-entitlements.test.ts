import { describe, expect, it } from 'vitest';
import { createFreePlanSnapshot, getPlanEntitlements } from 'shared/plans';

describe('plan entitlements', () => {
  it('always creates a Free snapshot for the public release', () => {
    expect(createFreePlanSnapshot()).toEqual({
      plan: 'free',
      entitlements: getPlanEntitlements('free'),
    });
  });

  it('defines the complete Free limits and unrestricted Pro behavior', () => {
    expect(getPlanEntitlements('free')).toEqual({
      maxCustomFeeds: 3,
      maxMembersPerFeed: 10,
      maxOutgoingShareRecipients: 1,
      maxOutgoingSharedFeeds: 3,
      maxIncomingShareOwners: 1,
      maxIncomingSharedFeeds: 3,
      maxVisibleProfileViewers: 10,
      collectAllVisibleProfileViewers: false,
      collectPrivateProfileViewers: false,
      collectRecruiterProfileViewers: false,
    });
    expect(getPlanEntitlements('pro')).toEqual({
      maxCustomFeeds: null,
      maxMembersPerFeed: null,
      maxOutgoingShareRecipients: null,
      maxOutgoingSharedFeeds: null,
      maxIncomingShareOwners: null,
      maxIncomingSharedFeeds: null,
      maxVisibleProfileViewers: null,
      collectAllVisibleProfileViewers: true,
      collectPrivateProfileViewers: true,
      collectRecruiterProfileViewers: true,
    });
  });
});
