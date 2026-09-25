import { describe, expect, it } from 'vitest';
import { parseSubscriptionWebhookPayload, parseWebhookEnvelope } from '../webhook-schema.js';

function createPayload() {
  return {
    meta: {
      event_name: 'subscription_created',
      custom_data: { checkout_session_id: '00000000-0000-4000-8000-000000000001' },
    },
    data: {
      type: 'subscriptions',
      id: 'subscription-1',
      attributes: {
        store_id: 42,
        customer_id: 7,
        variant_id: 2069629,
        user_email: 'customer@example.com',
        status: 'active',
        cancelled: false,
        renews_at: '2027-08-29T12:00:00.000Z',
        ends_at: null,
        updated_at: '2026-08-29T12:00:00.000Z',
        test_mode: true,
      },
    },
  };
}

describe('Lemon Squeezy webhook runtime schemas', () => {
  it('accepts a valid subscription webhook', () => {
    expect(parseSubscriptionWebhookPayload(createPayload()).data.id).toBe('subscription-1');
  });

  it('rejects a malformed webhook envelope before reading the event', () => {
    expect(() => parseWebhookEnvelope({ data: {} })).toThrow();
  });

  it('rejects provider fields with unsafe runtime types', () => {
    const payload = createPayload();
    payload.data.attributes.cancelled = 'false' as unknown as boolean;

    expect(() => parseSubscriptionWebhookPayload(payload)).toThrow();
  });

  it('rejects unknown subscription statuses and invalid provider dates', () => {
    const unknownStatus = createPayload();
    unknownStatus.data.attributes.status = 'surprise_status';
    const invalidDate = createPayload();
    invalidDate.data.attributes.updated_at = 'not-a-date';

    expect(() => parseSubscriptionWebhookPayload(unknownStatus)).toThrow();
    expect(() => parseSubscriptionWebhookPayload(invalidDate)).toThrow();
  });
});
