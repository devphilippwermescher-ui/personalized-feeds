import { describe, expect, it } from 'vitest';
import { resolveBillingNotice } from 'shared/billing-notices';
import type { BillingSubscription } from 'shared/plans';
import type { BillingPaymentStatus } from 'shared/billing-payment-status';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');

function subscription(overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  return {
    plan: 'pro',
    status: 'active',
    subscriptionId: 'subscription-1',
    providerUpdatedAt: NOW,
    ...overrides,
  };
}

describe('billing notification policy', () => {
  it('does not warn before an active auto-renewal', () => {
    expect(resolveBillingNotice(subscription({ renewsAt: NOW + 24 * 60 * 60 * 1_000 }), NOW)).toBeNull();
  });

  it('shows a cancellation notice immediately while Pro access remains active', () => {
    const endsAt = NOW + 30 * 24 * 60 * 60 * 1_000;
    const cancelled = subscription({
      status: 'cancelled',
      cancelAtPeriodEnd: true,
      endsAt,
    });
    const scheduledToCancel = subscription({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: endsAt,
    });

    const expectedNotice = {
      id: `ending_soon--subscription-1--${endsAt}`,
      kind: 'ending_soon',
      action: 'portal',
      endsAt,
    };
    expect(resolveBillingNotice(cancelled, NOW)).toEqual(expectedNotice);
    expect(resolveBillingNotice(scheduledToCancel, NOW)).toEqual(expectedNotice);
  });

  it('shows a payment warning immediately and keeps its id stable for the same failed renewal', () => {
    const renewsAt = NOW - 1_000;
    const first = resolveBillingNotice(subscription({ status: 'past_due', renewsAt, providerUpdatedAt: NOW }), NOW);
    const repeated = resolveBillingNotice(
      subscription({ status: 'past_due', renewsAt, providerUpdatedAt: NOW + 10_000 }),
      NOW + 10_000
    );

    expect(first).toEqual({
      id: `payment_failed--subscription-1--${renewsAt}`,
      kind: 'payment_failed',
      action: 'portal',
    });
    expect(repeated?.id).toBe(first?.id);
  });

  it('uses the invoice id for payment events and clears the warning after recovery', () => {
    const failed: BillingPaymentStatus = {
      subscriptionId: 'subscription-1',
      invoiceId: 'invoice-1',
      status: 'failed',
      eventName: 'subscription_payment_failed',
      providerUpdatedAt: NOW,
      updatedAt: NOW,
    };
    const recovered: BillingPaymentStatus = {
      ...failed,
      status: 'resolved',
      eventName: 'subscription_payment_recovered',
      updatedAt: NOW + 1,
    };

    expect(resolveBillingNotice(subscription({ updatedAt: NOW - 1 }), NOW, failed)).toMatchObject({
      id: 'payment_failed--subscription-1--invoice-1',
      kind: 'payment_failed',
    });
    expect(resolveBillingNotice(subscription({ status: 'past_due', updatedAt: NOW }), NOW, recovered)).toBeNull();
  });

  it('does not let an old failed payment override a newer active subscription state', () => {
    const failed: BillingPaymentStatus = {
      subscriptionId: 'subscription-1',
      invoiceId: 'invoice-1',
      status: 'failed',
      eventName: 'subscription_payment_failed',
      providerUpdatedAt: NOW,
      updatedAt: NOW,
    };

    expect(resolveBillingNotice(subscription({ updatedAt: NOW + 1 }), NOW + 1, failed)).toBeNull();
  });

  it('shows a final notice for expired access and for a cancelled paid period that elapsed', () => {
    expect(resolveBillingNotice(subscription({ status: 'expired', endsAt: NOW - 1_000 }), NOW)?.kind).toBe('expired');
    expect(resolveBillingNotice(subscription({ status: 'cancelled', endsAt: NOW }), NOW)?.kind).toBe('expired');
  });
});
