import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { savePaymentStatus } from '../payment-status-repository.js';
import type { PaymentStatusWriteModel } from '../payment-event-state.js';

function paymentStatus(overrides: Partial<PaymentStatusWriteModel> = {}): PaymentStatusWriteModel {
  return {
    subscriptionId: 'subscription-1',
    invoiceId: 'invoice-1',
    storeId: '42',
    customerId: 'customer-1',
    status: 'failed',
    eventName: 'subscription_payment_failed',
    providerUpdatedAt: 100,
    updatedAt: 200,
    testMode: true,
    ...overrides,
  };
}

function createFirestore(documents: Map<string, Record<string, unknown>>): Firestore {
  const documentReference = (path: string) => ({ path });
  const snapshot = (path: string) => {
    const data = documents.get(path);
    return {
      exists: data !== undefined,
      get: (field: string) => data?.[field],
    };
  };
  const transaction = {
    get: async (reference: { path: string }) => snapshot(reference.path),
    set: (reference: { path: string }, data: Record<string, unknown>) => documents.set(reference.path, data),
  };
  return {
    doc: documentReference,
    collection: (path: string) => ({ doc: (id: string) => documentReference(`${path}/${id}`) }),
    runTransaction: async <T>(callback: (value: typeof transaction) => Promise<T>) => callback(transaction),
  } as unknown as Firestore;
}

describe('payment status repository', () => {
  it('writes a failure for the currently entitled subscription and resolves it once', async () => {
    const documents = new Map<string, Record<string, unknown>>([
      ['billingSubscriptions/subscription-1', { userId: 'user-1' }],
      ['users/user-1/billingSubscriptions/subscription-1', { storeId: '42', customerId: 'customer-1', testMode: true }],
      ['users/user-1/billing/subscription', { subscriptionId: 'subscription-1' }],
    ]);
    const db = createFirestore(documents);

    expect(await savePaymentStatus({ db, paymentStatus: paymentStatus() })).toBe('updated');
    expect(documents.get('users/user-1/billing/paymentStatus')).toMatchObject({
      invoiceId: 'invoice-1',
      status: 'failed',
    });
    expect(await savePaymentStatus({ db, paymentStatus: paymentStatus() })).toBe('ignored_duplicate');

    const recovered = paymentStatus({
      status: 'resolved',
      eventName: 'subscription_payment_recovered',
      updatedAt: 300,
    });
    expect(await savePaymentStatus({ db, paymentStatus: recovered })).toBe('updated');
    expect(documents.get('users/user-1/billing/paymentStatus')).toMatchObject({ status: 'resolved' });
  });

  it('does not let a same-time failed event overwrite a recovered invoice', async () => {
    const documents = new Map<string, Record<string, unknown>>([
      ['billingSubscriptions/subscription-1', { userId: 'user-1' }],
      ['users/user-1/billingSubscriptions/subscription-1', { storeId: '42', customerId: 'customer-1', testMode: true }],
      ['users/user-1/billing/subscription', { subscriptionId: 'subscription-1' }],
      [
        'users/user-1/billing/paymentStatus',
        {
          ...paymentStatus(),
          status: 'resolved',
          eventName: 'subscription_payment_recovered',
        },
      ],
    ]);

    expect(await savePaymentStatus({ db: createFirestore(documents), paymentStatus: paymentStatus() })).toBe(
      'ignored_stale'
    );
  });

  it('ignores payment events for a subscription that is no longer the entitlement source', async () => {
    const documents = new Map<string, Record<string, unknown>>([
      ['billingSubscriptions/subscription-1', { userId: 'user-1' }],
      ['users/user-1/billingSubscriptions/subscription-1', { storeId: '42', customerId: 'customer-1', testMode: true }],
      ['users/user-1/billing/subscription', { subscriptionId: 'subscription-2' }],
    ]);

    expect(await savePaymentStatus({ db: createFirestore(documents), paymentStatus: paymentStatus() })).toBe(
      'ignored_non_entitlement'
    );
  });
});
