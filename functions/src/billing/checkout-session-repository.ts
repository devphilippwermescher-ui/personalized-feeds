import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BillingInterval, BillingStoreConfiguration } from './types.js';

const CHECKOUT_SESSION_COLLECTION = 'billingCheckoutSessions';
const USER_CHECKOUT_LOCK_COLLECTION = 'billingUserCheckoutLocks';
const CHECKOUT_CREATION_LOCK_LIFETIME_MS = 10 * 1000;
const READY_CHECKOUT_LOCK_LIFETIME_MS = 5 * 60 * 1000;
const PROVIDER_CHECKOUT_LIFETIME_MS = 30 * 60 * 1000;
const WEBHOOK_DELIVERY_GRACE_MS = 10 * 60 * 1000;

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

interface UserCheckoutLockWriteModel {
  sessionId: string;
  storeId: string;
  variantId: string;
  currency: 'EUR' | 'USD';
  interval: BillingInterval;
  testMode: boolean;
  status: 'creating' | 'ready';
  checkoutUrl?: string;
  createdAt: number;
  checkoutExpiresAt: number;
  expiresAt: number;
  deleteAt: Timestamp;
}

export class BillingCheckoutInProgressError extends Error {
  constructor(
    readonly state: 'creating' | 'ready',
    readonly currency: 'EUR' | 'USD',
    readonly interval: BillingInterval,
    readonly retryAfterSeconds: number
  ) {
    super('A checkout is already being prepared for this Firebase user');
    this.name = 'BillingCheckoutInProgressError';
  }
}

export type CheckoutSessionResult =
  | { state: 'created'; sessionId: string; session: CheckoutSessionWriteModel }
  | { state: 'ready'; sessionId: string; checkoutUrl: string };

function assertValidUserId(userId: string): void {
  if (!userId || userId.length > 128 || userId.includes('/')) {
    throw new Error('Cannot create a checkout session for an invalid Firebase user ID');
  }
}

function getEffectiveLockExpiresAt(lock: Partial<UserCheckoutLockWriteModel>): number | null {
  if (typeof lock.expiresAt !== 'number') return null;
  if (typeof lock.createdAt !== 'number') return lock.expiresAt;
  const maximumLifetime =
    lock.status === 'ready' ? READY_CHECKOUT_LOCK_LIFETIME_MS : CHECKOUT_CREATION_LOCK_LIFETIME_MS;
  return Math.min(lock.expiresAt, lock.createdAt + maximumLifetime);
}

export async function createCheckoutSession(params: {
  db: Firestore;
  userId: string;
  configuration: BillingStoreConfiguration;
  interval: BillingInterval;
  testMode: boolean;
  now?: number;
}): Promise<CheckoutSessionResult> {
  assertValidUserId(params.userId);
  const now = params.now ?? Date.now();
  const sessionId = randomUUID();
  const checkoutExpiresAt = now + PROVIDER_CHECKOUT_LIFETIME_MS;
  const creationLockExpiresAt = now + CHECKOUT_CREATION_LOCK_LIFETIME_MS;
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

  const lockRef = params.db.collection(USER_CHECKOUT_LOCK_COLLECTION).doc(params.userId);
  const sessionRef = params.db.collection(CHECKOUT_SESSION_COLLECTION).doc(sessionId);
  const variantId = params.configuration.variants[params.interval];

  return params.db.runTransaction(async (transaction) => {
    const lockSnapshot = await transaction.get(lockRef);
    const lock = lockSnapshot.data() as Partial<UserCheckoutLockWriteModel> | undefined;
    const effectiveLockExpiresAt = lock ? getEffectiveLockExpiresAt(lock) : null;
    if (lockSnapshot.exists && lock && effectiveLockExpiresAt !== null && effectiveLockExpiresAt > now) {
      const matchesRequestedCheckout =
        lock.storeId === params.configuration.storeId &&
        lock.variantId === variantId &&
        lock.currency === params.configuration.currency &&
        lock.interval === params.interval &&
        lock.testMode === params.testMode;
      if (
        matchesRequestedCheckout &&
        lock.status === 'ready' &&
        typeof lock.checkoutUrl === 'string' &&
        lock.checkoutUrl
      ) {
        return { state: 'ready', sessionId: String(lock.sessionId), checkoutUrl: lock.checkoutUrl };
      }
      const retryAfterSeconds = Math.max(1, Math.ceil((effectiveLockExpiresAt - now) / 1000));
      throw new BillingCheckoutInProgressError(
        lock.status === 'ready' ? 'ready' : 'creating',
        lock.currency === 'EUR' ? 'EUR' : 'USD',
        lock.interval === 'annual' ? 'annual' : 'monthly',
        retryAfterSeconds
      );
    }

    const lockWrite: UserCheckoutLockWriteModel = {
      sessionId,
      storeId: params.configuration.storeId,
      variantId,
      currency: params.configuration.currency,
      interval: params.interval,
      testMode: params.testMode,
      status: 'creating',
      createdAt: now,
      checkoutExpiresAt,
      expiresAt: creationLockExpiresAt,
      deleteAt: Timestamp.fromMillis(creationLockExpiresAt),
    };
    transaction.set(sessionRef, session);
    transaction.set(lockRef, lockWrite);
    return { state: 'created', sessionId, session };
  });
}

export async function completeCheckoutSession(params: {
  db: Firestore;
  userId: string;
  sessionId: string;
  checkoutUrl: string;
}): Promise<void> {
  assertValidUserId(params.userId);
  const lockRef = params.db.collection(USER_CHECKOUT_LOCK_COLLECTION).doc(params.userId);
  await params.db.runTransaction(async (transaction) => {
    const lockSnapshot = await transaction.get(lockRef);
    if (!lockSnapshot.exists || lockSnapshot.get('sessionId') !== params.sessionId) {
      throw new Error('Checkout lock no longer matches the created session');
    }
    const checkoutExpiresAt = lockSnapshot.get('checkoutExpiresAt');
    const createdAt = lockSnapshot.get('createdAt');
    if (typeof checkoutExpiresAt !== 'number' || typeof createdAt !== 'number') {
      throw new Error('Checkout lock does not contain a valid expiration time');
    }
    const readyLockExpiresAt = Math.min(checkoutExpiresAt, createdAt + READY_CHECKOUT_LOCK_LIFETIME_MS);
    transaction.set(
      lockRef,
      {
        status: 'ready',
        checkoutUrl: params.checkoutUrl,
        expiresAt: readyLockExpiresAt,
        deleteAt: Timestamp.fromMillis(readyLockExpiresAt),
      },
      { merge: true }
    );
  });
}

export async function getReadyCheckoutSessionUrl(params: {
  db: Firestore;
  userId: string;
  sessionId: string;
  now?: number;
}): Promise<string | null> {
  assertValidUserId(params.userId);
  if (!params.sessionId) return null;

  const now = params.now ?? Date.now();
  const lockSnapshot = await params.db.collection(USER_CHECKOUT_LOCK_COLLECTION).doc(params.userId).get();
  if (!lockSnapshot.exists || lockSnapshot.get('sessionId') !== params.sessionId) return null;

  const lock = lockSnapshot.data() as Partial<UserCheckoutLockWriteModel> | undefined;
  const effectiveLockExpiresAt = lock ? getEffectiveLockExpiresAt(lock) : null;
  if (
    lock?.status !== 'ready' ||
    typeof lock.checkoutUrl !== 'string' ||
    !lock.checkoutUrl ||
    effectiveLockExpiresAt === null ||
    effectiveLockExpiresAt <= now
  ) {
    return null;
  }

  return lock.checkoutUrl;
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
  const checkoutExpiresAt = now + PROVIDER_CHECKOUT_LIFETIME_MS;
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

export async function deleteCheckoutSession(db: Firestore, sessionId: string, userId?: string): Promise<void> {
  const sessionRef = db.collection(CHECKOUT_SESSION_COLLECTION).doc(sessionId);
  if (!userId) {
    await sessionRef.delete();
    return;
  }

  assertValidUserId(userId);
  const lockRef = db.collection(USER_CHECKOUT_LOCK_COLLECTION).doc(userId);
  await db.runTransaction(async (transaction) => {
    const lockSnapshot = await transaction.get(lockRef);
    transaction.delete(sessionRef);
    if (lockSnapshot.exists && lockSnapshot.get('sessionId') === sessionId) {
      transaction.delete(lockRef);
    }
  });
}
