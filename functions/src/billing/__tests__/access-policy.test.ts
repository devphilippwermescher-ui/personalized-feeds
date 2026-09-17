import { describe, expect, it } from 'vitest';
import { hasCurrentProAccess, selectEntitlementSubscription } from '../access-policy.js';

describe('billing access policy', () => {
  it('keeps Pro access while an active subscription payment is past due', () => {
    expect(hasCurrentProAccess({ plan: 'pro', status: 'active' })).toBe(true);
    expect(hasCurrentProAccess({ plan: 'pro', status: 'past_due' })).toBe(true);
  });

  it('keeps cancelled access only through the paid period', () => {
    const now = Date.parse('2026-09-16T12:00:00.000Z');
    expect(hasCurrentProAccess({ plan: 'pro', status: 'cancelled', endsAt: now + 1 }, now)).toBe(true);
    expect(hasCurrentProAccess({ plan: 'pro', status: 'cancelled', endsAt: now }, now)).toBe(false);
  });

  it('does not treat unpaid, expired, or incomplete data as current Pro access', () => {
    expect(hasCurrentProAccess({ plan: 'pro', status: 'unpaid' })).toBe(false);
    expect(hasCurrentProAccess({ plan: 'pro', status: 'expired' })).toBe(false);
    expect(hasCurrentProAccess({ plan: 'free', status: 'active' })).toBe(false);
    expect(hasCurrentProAccess(undefined)).toBe(false);
  });

  it('keeps an active subscription selected when a newer old subscription expires', () => {
    const active = { plan: 'pro', status: 'active', providerUpdatedAt: 100, subscriptionId: 'new-active' };
    const expired = { plan: 'pro', status: 'expired', providerUpdatedAt: 200, subscriptionId: 'old-expired' };

    expect(selectEntitlementSubscription([active, expired])).toBe(active);
  });

  it('prefers active access over past-due and cancelled grace subscriptions', () => {
    const now = 100;
    const cancelled = {
      plan: 'pro',
      status: 'cancelled',
      endsAt: 200,
      providerUpdatedAt: 500,
      subscriptionId: 'cancelled',
    };
    const pastDue = { plan: 'pro', status: 'past_due', providerUpdatedAt: 400, subscriptionId: 'past-due' };
    const active = { plan: 'pro', status: 'active', providerUpdatedAt: 300, subscriptionId: 'active' };

    expect(selectEntitlementSubscription([cancelled, pastDue, active], now)).toBe(active);
  });

  it('keeps the newest provider state when no subscription currently grants access', () => {
    const older = { plan: 'pro', status: 'expired', providerUpdatedAt: 100, subscriptionId: 'older' };
    const newer = { plan: 'pro', status: 'unpaid', providerUpdatedAt: 200, subscriptionId: 'newer' };

    expect(selectEntitlementSubscription([older, newer])).toBe(newer);
  });
});
