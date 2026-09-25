import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  claimPendingSubscriptions,
  createSubscriptionFirestoreUpdate,
  saveSubscription,
} from '../firestore-subscription-repository.js';
import { hashBillingEmail } from '../email-identity.js';
import type { SubscriptionWriteModel } from '../subscription-state.js';

function createSubscription(overrides: Partial<SubscriptionWriteModel> = {}): SubscriptionWriteModel {
  return {
    plan: 'pro',
    source: 'lemon_squeezy',
    billingCurrency: 'EUR',
    storeId: '84',
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

  it('does not let an expired old subscription replace another active subscription', async () => {
    const documents = new Map<string, Record<string, unknown>>();
    const createDocumentReference = (path: string) => ({ kind: 'document', path });
    const createCollectionReference = (path: string) => ({
      kind: 'collection',
      path,
      doc: (id: string) => createDocumentReference(`${path}/${id}`),
    });
    const createSnapshot = (path: string) => {
      const data = documents.get(path);
      return {
        id: path.slice(path.lastIndexOf('/') + 1),
        ref: createDocumentReference(path),
        exists: data !== undefined,
        data: () => data,
        get: (field: string) => data?.[field],
      };
    };
    const transaction = {
      get: async (reference: { kind: string; path: string }) => {
        if (reference.kind === 'document') return createSnapshot(reference.path);
        const prefix = `${reference.path}/`;
        return {
          docs: [...documents.keys()]
            .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
            .map(createSnapshot),
        };
      },
      set: (reference: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
        const previous = options?.merge ? documents.get(reference.path) : undefined;
        documents.set(reference.path, { ...previous, ...data });
      },
      delete: (reference: { path: string }) => {
        documents.delete(reference.path);
      },
      update: (reference: { path: string }, data: Record<string, unknown>) => {
        documents.set(reference.path, { ...documents.get(reference.path), ...data });
      },
    };
    const db = {
      doc: createDocumentReference,
      collection: createCollectionReference,
      runTransaction: async <T>(callback: (value: typeof transaction) => Promise<T>) => callback(transaction),
    } as unknown as Firestore;
    const uid = 'firebase-user';
    const sessionA = '00000000-0000-4000-8000-000000000001';
    const sessionB = '00000000-0000-4000-8000-000000000002';
    const addSession = (sessionId: string, subscription: SubscriptionWriteModel) => {
      documents.set(`billingCheckoutSessions/${sessionId}`, {
        userId: uid,
        storeId: subscription.storeId,
        variantId: subscription.variantId,
        currency: subscription.billingCurrency,
        interval: subscription.billingInterval,
        testMode: subscription.testMode,
        expiresAt: Date.now() + 60_000,
      });
    };
    const subscriptionA = createSubscription({ subscriptionId: 'subscription-a', providerUpdatedAt: 100 });
    const subscriptionB = createSubscription({ subscriptionId: 'subscription-b', providerUpdatedAt: 200 });
    addSession(sessionA, subscriptionA);
    addSession(sessionB, subscriptionB);

    await saveSubscription({
      db,
      checkoutSessionId: sessionA,
      customerEmail: 'customer@example.com',
      subscription: subscriptionA,
    });
    await saveSubscription({
      db,
      checkoutSessionId: sessionB,
      customerEmail: 'customer@example.com',
      subscription: subscriptionB,
    });

    expect(documents.has(`billingCheckoutSessions/${sessionA}`)).toBe(false);
    expect(documents.has(`billingCheckoutSessions/${sessionB}`)).toBe(false);
    const result = await saveSubscription({
      db,
      checkoutSessionId: sessionA,
      customerEmail: 'customer@example.com',
      subscription: createSubscription({
        subscriptionId: 'subscription-a',
        status: 'expired',
        providerUpdatedAt: 300,
      }),
    });

    expect(result).toBe('updated');
    expect(documents.get(`users/${uid}/billingSubscriptions/subscription-a`)).toMatchObject({ status: 'expired' });
    expect(documents.get(`users/${uid}/billingSubscriptions/subscription-b`)).toMatchObject({ status: 'active' });
    expect(documents.get(`users/${uid}/billing/subscription`)).toMatchObject({
      subscriptionId: 'subscription-b',
      status: 'active',
    });
  });

  it('holds a guest subscription by hashed email and claims it for a verified Firebase user', async () => {
    const documents = new Map<string, Record<string, unknown>>();
    const createDocumentReference = (path: string) => ({ kind: 'document', path });
    const createCollectionReference = (path: string) => ({
      kind: 'collection',
      path,
      doc: (id: string) => createDocumentReference(`${path}/${id}`),
    });
    const createSnapshot = (path: string) => {
      const data = documents.get(path);
      return {
        id: path.slice(path.lastIndexOf('/') + 1),
        ref: createDocumentReference(path),
        exists: data !== undefined,
        data: () => data,
        get: (field: string) => data?.[field],
      };
    };
    const transaction = {
      get: async (reference: { kind: string; path: string }) => {
        if (reference.kind === 'document') return createSnapshot(reference.path);
        const prefix = `${reference.path}/`;
        return {
          docs: [...documents.keys()]
            .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
            .map(createSnapshot),
        };
      },
      set: (reference: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
        const previous = options?.merge ? documents.get(reference.path) : undefined;
        documents.set(reference.path, { ...previous, ...data });
      },
      delete: (reference: { path: string }) => documents.delete(reference.path),
    };
    const db = {
      doc: createDocumentReference,
      collection: createCollectionReference,
      runTransaction: async <T>(callback: (value: typeof transaction) => Promise<T>) => callback(transaction),
    } as unknown as Firestore;
    const subscription = createSubscription({ subscriptionId: 'guest-subscription' });
    const checkoutSessionId = '00000000-0000-4000-8000-000000000003';
    documents.set(`billingCheckoutSessions/${checkoutSessionId}`, {
      identityType: 'guest',
      storeId: subscription.storeId,
      variantId: subscription.variantId,
      currency: subscription.billingCurrency,
      interval: subscription.billingInterval,
      testMode: subscription.testMode,
      expiresAt: Date.now() + 60_000,
    });

    const saved = await saveSubscription({
      db,
      checkoutSessionId,
      customerEmail: 'Customer@Example.com',
      subscription,
    });
    const emailHash = hashBillingEmail('customer@example.com');

    expect(saved).toBe('pending_claim');
    expect(documents.get(`billingSubscriptions/${subscription.subscriptionId}`)).toMatchObject({
      pendingEmailHash: emailHash,
    });
    expect(
      documents.get(`billingPendingClaims/${emailHash}/billingSubscriptions/${subscription.subscriptionId}`)
    ).toMatchObject({ status: 'active' });

    const claimedCount = await claimPendingSubscriptions({
      db,
      userId: 'firebase-user',
      normalizedEmail: 'customer@example.com',
    });

    expect(claimedCount).toBe(1);
    expect(documents.get('users/firebase-user/billing/subscription')).toMatchObject({
      subscriptionId: 'guest-subscription',
      status: 'active',
    });
    expect(documents.get('billingSubscriptions/guest-subscription')).toMatchObject({
      userId: 'firebase-user',
    });
    expect(documents.has(`billingPendingClaims/${emailHash}/billingSubscriptions/${subscription.subscriptionId}`)).toBe(
      false
    );
  });
});
