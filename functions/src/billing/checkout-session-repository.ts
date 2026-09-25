import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BillingInterval, BillingStoreConfiguration } from './types.js';

const CHECKOUT_SESSION_COLLECTION = 'billingCheckoutSessions';
const CHECKOUT_SESSION_LIFETIME_MS = 30 * 60 * 1000;
const WEBHOOK_DELIVERY_GRACE_MS = 5 * 60 * 1000;

export interface CheckoutSessionWriteModel {
  identityType: 'user' | 'guest';
  userId?: string;
  storeId: string;
  variantId: string;
  currency: 'EUR' | 'USD';
  interval: BillingInterval;
  testMode: boolean;
  createdAt: number;
  checkoutExpiresAt: number;
  expiresAt: number;
  deleteAt: Timestamp;
}

function assertValidUserId(userId: string): void {
  if (!userId || userId.length > 128 || userId.includes('/')) {
    throw new Error('Cannot create a checkout session for an invalid Firebase user ID');
  }
}

export async function createCheckoutSession(params: {
  db: Firestore;
  userId: string;
  configuration: BillingStoreConfiguration;
  interval: BillingInterval;
  testMode: boolean;
  now?: number;
}): Promise<{ sessionId: string; session: CheckoutSessionWriteModel }> {
  assertValidUserId(params.userId);
  const now = params.now ?? Date.now();
  const sessionId = randomUUID();
  const checkoutExpiresAt = now + CHECKOUT_SESSION_LIFETIME_MS;
  const sessionExpiresAt = checkoutExpiresAt + WEBHOOK_DELIVERY_GRACE_MS;
  const session: CheckoutSessionWriteModel = {
    identityType: 'user',
    userId: params.userId,
    storeId: params.configuration.storeId,
    variantId: params.configuration.variants[params.interval],
    currency: params.configuration.currency,
    interval: params.interval,
    testMode: params.testMode,
    createdAt: now,
    checkoutExpiresAt,
    expiresAt: sessionExpiresAt,
    deleteAt: Timestamp.fromMillis(sessionExpiresAt),
  };

  await params.db.collection(CHECKOUT_SESSION_COLLECTION).doc(sessionId).set(session);
  return { sessionId, session };
}

export async function createGuestCheckoutSession(params: {
  db: Firestore;
  configuration: BillingStoreConfiguration;
  interval: BillingInterval;
  testMode: boolean;
  now?: number;
}): Promise<{ sessionId: string; session: CheckoutSessionWriteModel }> {
  const now = params.now ?? Date.now();
  const sessionId = randomUUID();
  const checkoutExpiresAt = now + CHECKOUT_SESSION_LIFETIME_MS;
  const sessionExpiresAt = checkoutExpiresAt + WEBHOOK_DELIVERY_GRACE_MS;
  const session: CheckoutSessionWriteModel = {
    identityType: 'guest',
    storeId: params.configuration.storeId,
    variantId: params.configuration.variants[params.interval],
    currency: params.configuration.currency,
    interval: params.interval,
    testMode: params.testMode,
    createdAt: now,
    checkoutExpiresAt,
    expiresAt: sessionExpiresAt,
    deleteAt: Timestamp.fromMillis(sessionExpiresAt),
  };
  await params.db.collection(CHECKOUT_SESSION_COLLECTION).doc(sessionId).set(session);
  return { sessionId, session };
}

export async function deleteCheckoutSession(db: Firestore, sessionId: string): Promise<void> {
  await db.collection(CHECKOUT_SESSION_COLLECTION).doc(sessionId).delete();
}
