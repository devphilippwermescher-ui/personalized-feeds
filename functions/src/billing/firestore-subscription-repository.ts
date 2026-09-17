import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { selectEntitlementSubscription } from './access-policy.js';
import type { SubscriptionWriteModel } from './subscription-state.js';

const SUBSCRIPTION_INDEX_COLLECTION = 'billingSubscriptions';
const CHECKOUT_SESSION_COLLECTION = 'billingCheckoutSessions';
const USER_SUBSCRIPTIONS_COLLECTION = 'billingSubscriptions';

function assertValidUserId(userId: string): void {
  if (!userId || userId.length > 128 || userId.includes('/')) {
    throw new Error('Webhook contains an invalid Firebase user ID');
  }
}

export function createSubscriptionFirestoreUpdate(subscription: SubscriptionWriteModel) {
  return {
    ...subscription,
    renewsAt: subscription.renewsAt ?? FieldValue.delete(),
    endsAt: subscription.endsAt ?? FieldValue.delete(),
    currentPeriodEnd: subscription.currentPeriodEnd ?? FieldValue.delete(),
  };
}

function isSubscriptionWriteModel(value: unknown): value is SubscriptionWriteModel {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SubscriptionWriteModel>;
  return (
    candidate.plan === 'pro' &&
    candidate.source === 'lemon_squeezy' &&
    typeof candidate.subscriptionId === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.providerUpdatedAt === 'number'
  );
}

function assertValidCheckoutSessionId(sessionId: string): void {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(sessionId)) {
    throw new Error('Webhook contains an invalid checkout session ID');
  }
}

function validateCheckoutSession(params: {
  session: Record<string, unknown>;
  subscription: SubscriptionWriteModel;
  now: number;
}): string {
  const { session, subscription, now } = params;
  const userId = session.userId;
  if (typeof userId !== 'string') throw new Error('Checkout session is missing its Firebase user');
  assertValidUserId(userId);

  if (typeof session.expiresAt !== 'number' || session.expiresAt <= now) {
    throw new Error('Checkout session has expired');
  }

  if (
    session.storeId !== subscription.storeId ||
    session.variantId !== subscription.variantId ||
    session.currency !== subscription.billingCurrency ||
    session.interval !== subscription.billingInterval ||
    session.testMode !== subscription.testMode
  ) {
    throw new Error('Checkout session does not match the purchased subscription');
  }
  return userId;
}

export async function saveSubscription(params: {
  db: Firestore;
  checkoutSessionId: string | null;
  subscription: SubscriptionWriteModel;
}): Promise<'updated' | 'ignored_stale' | 'missing_user'> {
  const indexRef = params.db.collection(SUBSCRIPTION_INDEX_COLLECTION).doc(params.subscription.subscriptionId);
  const now = Date.now();

  return params.db.runTransaction(async (transaction) => {
    const indexSnapshot = await transaction.get(indexRef);
    const indexedUserId = indexSnapshot.exists ? indexSnapshot.get('userId') : null;
    let sessionRef = null;
    let sessionUserId: string | null = null;

    // The opaque checkout session is required only for the first event that
    // links a Lemon Squeezy subscription to a Firebase user. Later lifecycle
    // events use the immutable server-owned subscription index, so expiring
    // old checkout sessions cannot break cancellation or renewal webhooks.
    if (!indexedUserId && params.checkoutSessionId) {
      assertValidCheckoutSessionId(params.checkoutSessionId);
      sessionRef = params.db.collection(CHECKOUT_SESSION_COLLECTION).doc(params.checkoutSessionId);
      const sessionSnapshot = await transaction.get(sessionRef);
      if (!sessionSnapshot.exists) throw new Error('Checkout session was not found');
      sessionUserId = validateCheckoutSession({
        session: sessionSnapshot.data() as Record<string, unknown>,
        subscription: params.subscription,
        now,
      });
    }

    const userId = typeof indexedUserId === 'string' ? indexedUserId : sessionUserId;

    if (!userId) return 'missing_user';
    assertValidUserId(userId);
    const aggregateRef = params.db.doc(`users/${userId}/billing/subscription`);
    const userSubscriptionsRef = params.db.collection(`users/${userId}/${USER_SUBSCRIPTIONS_COLLECTION}`);
    const [aggregateSnapshot, subscriptionsSnapshot] = await Promise.all([
      transaction.get(aggregateRef),
      transaction.get(userSubscriptionsRef),
    ]);
    const currentSnapshot = subscriptionsSnapshot.docs.find(
      (snapshot) => snapshot.id === params.subscription.subscriptionId
    );
    const currentProviderUpdatedAt = currentSnapshot?.get('providerUpdatedAt');
    if (
      typeof currentProviderUpdatedAt === 'number' &&
      currentProviderUpdatedAt > params.subscription.providerUpdatedAt
    ) {
      return 'ignored_stale';
    }

    const subscriptionsById = new Map<string, SubscriptionWriteModel>();
    subscriptionsSnapshot.docs.forEach((snapshot) => {
      const subscription = snapshot.data();
      if (isSubscriptionWriteModel(subscription)) subscriptionsById.set(subscription.subscriptionId, subscription);
    });

    const legacyAggregate = aggregateSnapshot.data();
    if (isSubscriptionWriteModel(legacyAggregate) && !subscriptionsById.has(legacyAggregate.subscriptionId)) {
      subscriptionsById.set(legacyAggregate.subscriptionId, legacyAggregate);
      transaction.set(
        userSubscriptionsRef.doc(legacyAggregate.subscriptionId),
        createSubscriptionFirestoreUpdate(legacyAggregate),
        { merge: true }
      );
    }
    subscriptionsById.set(params.subscription.subscriptionId, params.subscription);

    const selectedSubscription = selectEntitlementSubscription([...subscriptionsById.values()], now);
    if (!selectedSubscription) throw new Error('Could not resolve the user billing entitlement');

    transaction.set(
      userSubscriptionsRef.doc(params.subscription.subscriptionId),
      createSubscriptionFirestoreUpdate(params.subscription),
      { merge: true }
    );
    transaction.set(aggregateRef, createSubscriptionFirestoreUpdate(selectedSubscription), { merge: true });
    transaction.set(
      indexRef,
      {
        userId,
        subscriptionId: params.subscription.subscriptionId,
        updatedAt: params.subscription.updatedAt,
      },
      { merge: true }
    );
    // The global subscription index now owns the durable mapping. Deleting
    // the session makes it one-time and prevents another subscription from
    // replaying the same opaque identifier.
    if (sessionRef) transaction.delete(sessionRef);
    return 'updated';
  });
}
