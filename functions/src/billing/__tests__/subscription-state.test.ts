import { describe, expect, it } from 'vitest';
import { parseSubscriptionWebhook } from '../subscription-state.js';
import type { BillingConfiguration, LemonSqueezySubscriptionWebhook } from '../types.js';

const configuration: BillingConfiguration = {
  storeId: '42',
  variants: { monthly: '2069629', annual: '2069645' },
  testMode: true,
};

function createPayload(overrides: Partial<LemonSqueezySubscriptionWebhook['data']['attributes']> = {}) {
  return {
    meta: { event_name: 'subscription_created', custom_data: { user_id: 'firebase-user' } },
    data: {
      type: 'subscriptions',
      id: 'subscription-1',
      attributes: {
        store_id: 42,
        customer_id: 7,
        variant_id: 2069645,
        status: 'active',
        cancelled: false,
        renews_at: '2027-08-29T12:00:00.000Z',
        ends_at: null,
        updated_at: '2026-08-29T12:00:00.000Z',
        test_mode: true,
        ...overrides,
      },
    },
  } satisfies LemonSqueezySubscriptionWebhook;
}

describe('Lemon Squeezy subscription mapping', () => {
  it('links an allowed annual subscription to the Firebase user', () => {
    const result = parseSubscriptionWebhook(createPayload(), configuration, 100);

    expect(result.userId).toBe('firebase-user');
    expect(result.subscription).toMatchObject({
      plan: 'pro',
      billingInterval: 'annual',
      variantId: '2069645',
      status: 'active',
      cancelAtPeriodEnd: false,
      testMode: true,
    });
    expect(result.subscription).not.toHaveProperty('endsAt');
  });

  it('keeps the paid end date for a cancelled subscription', () => {
    const result = parseSubscriptionWebhook(
      createPayload({
        status: 'cancelled',
        cancelled: true,
        renews_at: null,
        ends_at: '2026-09-29T12:00:00.000Z',
      }),
      configuration
    );

    expect(result.subscription.cancelAtPeriodEnd).toBe(true);
    expect(result.subscription.endsAt).toBe(Date.parse('2026-09-29T12:00:00.000Z'));
    expect(result.subscription.currentPeriodEnd).toBe(result.subscription.endsAt);
  });

  it('rejects a variant that is not part of the Pro product', () => {
    expect(() => parseSubscriptionWebhook(createPayload({ variant_id: 999 }), configuration)).toThrow(
      'not an allowed Pro variant'
    );
  });

  it('rejects live data in the test Firebase environment', () => {
    expect(() => parseSubscriptionWebhook(createPayload({ test_mode: false }), configuration)).toThrow(
      'test mode does not match'
    );
  });
});
