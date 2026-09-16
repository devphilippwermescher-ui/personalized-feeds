import { FieldValue } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { createSubscriptionFirestoreUpdate } from '../firestore-subscription-repository.js';
import type { SubscriptionWriteModel } from '../subscription-state.js';

function createSubscription(overrides: Partial<SubscriptionWriteModel> = {}): SubscriptionWriteModel {
  return {
    plan: 'pro',
    source: 'lemon_squeezy',
    billingCurrency: 'EUR',
    status: 'active',
    customerId: 'customer-1',
    subscriptionId: 'subscription-1',
    variantId: 'variant-1',
    billingInterval: 'monthly',
    renewsAt: 200,
    currentPeriodEnd: 200,
    cancelAtPeriodEnd: false,
    testMode: true,
    providerUpdatedAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe('subscription Firestore updates', () => {
  it('deletes a stale cancellation end date when an active subscription has no endsAt value', () => {
    const update = createSubscriptionFirestoreUpdate(createSubscription());

    expect(update.endsAt).toBe(FieldValue.delete());
    expect(update.renewsAt).toBe(200);
    expect(update.currentPeriodEnd).toBe(200);
  });

  it('keeps the cancellation end date and removes a missing renewal date', () => {
    const update = createSubscriptionFirestoreUpdate(
      createSubscription({
        status: 'cancelled',
        cancelAtPeriodEnd: true,
        renewsAt: undefined,
        endsAt: 300,
        currentPeriodEnd: 300,
      })
    );

    expect(update.renewsAt).toBe(FieldValue.delete());
    expect(update.endsAt).toBe(300);
    expect(update.currentPeriodEnd).toBe(300);
  });
});
