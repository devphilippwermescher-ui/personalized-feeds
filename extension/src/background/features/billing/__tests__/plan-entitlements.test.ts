import { describe, expect, it } from 'vitest';
import { createUserPlanSnapshot, getPlanEntitlements, resolveAppPlan } from 'shared/plans';

describe('plan entitlements', () => {
  it('fails closed to Free when billing data is absent, invalid, or inactive', () => {
    expect(resolveAppPlan(null)).toBe('free');
    expect(resolveAppPlan({ plan: 'pro' })).toBe('free');
    expect(resolveAppPlan({ plan: 'pro', status: 'cancelled' })).toBe('free');
    expect(resolveAppPlan({ plan: 'free', status: 'active' })).toBe('free');
  });

  it('enables Pro for active subscriptions without enabling an unconfigured trial', () => {
    expect(resolveAppPlan({ plan: 'pro', status: 'active' })).toBe('pro');
    expect(resolveAppPlan({ plan: 'pro', status: 'on_trial' })).toBe('free');
    expect(resolveAppPlan({ plan: 'pro', status: 'trialing' })).toBe('free');
  });

  it('keeps Pro through a cancelled subscription paid period only', () => {
    const now = Date.parse('2026-08-29T12:00:00.000Z');
    expect(resolveAppPlan({ plan: 'pro', status: 'cancelled', endsAt: now + 1000 }, now)).toBe('pro');
    expect(resolveAppPlan({ plan: 'pro', status: 'cancelled', endsAt: now - 1 }, now)).toBe('free');
    expect(resolveAppPlan({ plan: 'pro', status: 'expired', endsAt: now + 1000 }, now)).toBe('free');
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
