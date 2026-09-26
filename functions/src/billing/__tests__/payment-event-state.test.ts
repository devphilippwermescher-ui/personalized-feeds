import { describe, expect, it } from 'vitest';
import { isSubscriptionPaymentEvent, parseSubscriptionPaymentWebhook } from '../payment-event-state.js';
import type { BillingConfiguration, LemonSqueezySubscriptionInvoiceWebhook } from '../types.js';

const configuration: BillingConfiguration = {
  stores: {
    USD: { currency: 'USD', storeId: '42', variants: { monthly: '100', annual: '101' } },
    EUR: { currency: 'EUR', storeId: '84', variants: { monthly: '200', annual: '201' } },
  },
  testMode: true,
  checkoutSuccessUrl: 'https://myfeedpilot.com/checkout/success',
};

function payload(
  eventName: LemonSqueezySubscriptionInvoiceWebhook['meta']['event_name'],
  storeId = 42
): LemonSqueezySubscriptionInvoiceWebhook {
  return {
    meta: { event_name: eventName },
    data: {
      type: 'subscription-invoices',
      id: 'invoice-1',
      attributes: {
        store_id: storeId,
        subscription_id: 123,
        customer_id: 7,
        user_email: 'customer@example.com',
        billing_reason: 'renewal',
        status: eventName === 'subscription_payment_failed' ? 'pending' : 'paid',
        updated_at: '2026-09-26T12:00:00.000Z',
        test_mode: true,
      },
    },
  };
}

describe('Lemon Squeezy payment event mapping', () => {
  it('recognizes only the three supported payment events', () => {
    expect(isSubscriptionPaymentEvent('subscription_payment_failed')).toBe(true);
    expect(isSubscriptionPaymentEvent('subscription_payment_success')).toBe(true);
    expect(isSubscriptionPaymentEvent('subscription_payment_recovered')).toBe(true);
    expect(isSubscriptionPaymentEvent('subscription_plan_changed')).toBe(false);
  });

  it('maps failures and resolutions for both configured stores', () => {
    expect(parseSubscriptionPaymentWebhook(payload('subscription_payment_failed'), configuration, 500)).toMatchObject({
      subscriptionId: '123',
      invoiceId: 'invoice-1',
      storeId: '42',
      status: 'failed',
      updatedAt: 500,
    });
    expect(
      parseSubscriptionPaymentWebhook(payload('subscription_payment_recovered', 84), configuration, 600)
    ).toMatchObject({ storeId: '84', status: 'resolved', eventName: 'subscription_payment_recovered' });
  });

  it('rejects an unknown store and a live event in staging', () => {
    expect(() => parseSubscriptionPaymentWebhook(payload('subscription_payment_failed', 999), configuration)).toThrow(
      'store does not match'
    );
    const livePayload = payload('subscription_payment_success');
    livePayload.data.attributes.test_mode = false;
    expect(() => parseSubscriptionPaymentWebhook(livePayload, configuration)).toThrow('test mode does not match');
  });
});
