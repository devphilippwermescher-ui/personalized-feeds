import { describe, expect, it } from 'vitest';
import { createUserPlanSnapshot, getPlanEntitlements, resolveAppPlan } from 'shared/plans';

describe('plan entitlements', () => {
  it('fails closed to Free when billing data is absent, invalid, or inactive', () => {
    expect(resolveAppPlan(null)).toBe('free');
    expect(resolveAppPlan({ plan: 'pro' })).toBe('free');
    expect(resolveAppPlan({ plan: 'pro', status: 'cancelled' })).toBe('free');
    expect(resolveAppPlan({ plan: 'free', status: 'active' })).toBe('free');
  });

  it('enables Pro only for active or trial subscriptions', () => {
    expect(resolveAppPlan({ plan: 'pro', status: 'active' })).toBe('pro');
    expect(resolveAppPlan({ plan: 'pro', status: 'on_trial' })).toBe('pro');
    expect(resolveAppPlan({ plan: 'pro', status: 'trialing' })).toBe('pro');
  });

  it('defines the complete Free limits and unrestricted Pro behavior', () => {
    expect(getPlanEntitlements('free')).toEqual({
      maxCustomFeeds: 3,
      maxMembersPerFeed: 15,
      maxVisibleProfileViewers: 10,
      collectAllVisibleProfileViewers: false,
      collectPrivateProfileViewers: false,
      collectRecruiterProfileViewers: false,
    });
    expect(getPlanEntitlements('pro')).toEqual({
      maxCustomFeeds: null,
      maxMembersPerFeed: null,
      maxVisibleProfileViewers: null,
      collectAllVisibleProfileViewers: true,
      collectPrivateProfileViewers: true,
      collectRecruiterProfileViewers: true,
    });
  });

  it('keeps the authoritative subscription inside the background snapshot', () => {
    const subscription = { plan: 'pro' as const, status: 'active' };
    expect(createUserPlanSnapshot(subscription)).toMatchObject({
      plan: 'pro',
      subscription,
    });
  });
});
