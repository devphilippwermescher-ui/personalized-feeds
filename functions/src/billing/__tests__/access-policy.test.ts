import { describe, expect, it } from 'vitest';
import { hasCurrentProAccess } from '../access-policy.js';

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
});
