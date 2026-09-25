import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { selectEntitlementSubscription } from './access-policy.js';
import { hashBillingEmail, normalizeBillingEmail } from './email-identity.js';
import type { SubscriptionWriteModel } from './subscription-state.js';

const SUBSCRIPTION_INDEX_COLLECTION = 'billingSubscriptions';
const CHECKOUT_SESSION_COLLECTION = 'billingCheckoutSessions';
const USER_SUBSCRIPTIONS_COLLECTION = 'billingSubscriptions';
const PENDING_CLAIMS_COLLECTION = 'billingPendingClaims';

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
}): { kind: 'user'; userId: string } | { kind: 'guest' } {
  const { session, subscription, now } = params;
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

  const userId = session.userId;
  if (typeof userId === 'string') {
    assertValidUserId(userId);
    return { kind: 'user', userId };
  }
  if (session.identityType === 'guest') return { kind: 'guest' };
  throw new Error('Checkout session is missing its billing identity');
}

export async function saveSubscription(params: {
  db: Firestore;
  checkoutSessionId: string | null;
  customerEmail: string;
  subscription: SubscriptionWriteModel;
}): Promise<'updated' | 'pending_claim' | 'ignored_stale' | 'missing_user'> {
  const normalizedCustomerEmail = normalizeBillingEmail(params.customerEmail);
  if (!normalizedCustomerEmail) throw new Error('Subscription contains an invalid customer email');
  const indexRef = params.db.collection(SUBSCRIPTION_INDEX_COLLECTION).doc(params.subscription.subscriptionId);
  const now = Date.now();

  return params.db.runTransaction(async (transaction) => {
    const indexSnapshot = await transaction.get(indexRef);
    const indexedUserId = indexSnapshot.exists ? indexSnapshot.get('userId') : null;
    const indexedPendingEmailHash = indexSnapshot.exists ? indexSnapshot.get('pendingEmailHash') : null;
    let sessionRef = null;
    let sessionUserId: string | null = null;
    let sessionIsGuest = false;

    // The opaque checkout session is required only for the first event that
    // links a Lemon Squeezy subscription to a Firebase user. Later lifecycle
    // events use the immutable server-owned subscription index, so expiring
    // old checkout sessions cannot break cancellation or renewal webhooks.
    if (!indexedUserId && !indexedPendingEmailHash && params.checkoutSessionId) {
      assertValidCheckoutSessionId(params.checkoutSessionId);
      sessionRef = params.db.collection(CHECKOUT_SESSION_COLLECTION).doc(params.checkoutSessionId);
      const sessionSnapshot = await transaction.get(sessionRef);
      if (!sessionSnapshot.exists) throw new Error('Checkout session was not found');
      const identity = validateCheckoutSession({
        session: sessionSnapshot.data() as Record<string, unknown>,
        subscription: params.subscription,
        now,
      });
      if (identity.kind === 'user') sessionUserId = identity.userId;
      else sessionIsGuest = true;
    }

    const userId = typeof indexedUserId === 'string' ? indexedUserId : sessionUserId;
    const pendingEmailHash =
      typeof indexedPendingEmailHash === 'string'
        ? indexedPendingEmailHash
        : sessionIsGuest
          ? hashBillingEmail(normalizedCustomerEmail)
          : null;

    if (!userId && !pendingEmailHash) return 'missing_user';
    if (!userId && pendingEmailHash) {
      const pendingRef = params.db.doc(
        `${PENDING_CLAIMS_COLLECTION}/${pendingEmailHash}/${USER_SUBSCRIPTIONS_COLLECTION}/${params.subscription.subscriptionId}`
      );
      const pendingSnapshot = await transaction.get(pendingRef);
      const currentProviderUpdatedAt = pendingSnapshot.get('providerUpdatedAt');
      if (
        typeof currentProviderUpdatedAt === 'number' &&
        currentProviderUpdatedAt > params.subscription.providerUpdatedAt
      ) {
        return 'ignored_stale';
      }
      transaction.set(pendingRef, createSubscriptionFirestoreUpdate(params.subscription), { merge: true });
      transaction.set(
        indexRef,
        {
          pendingEmailHash,
          subscriptionId: params.subscription.subscriptionId,
          updatedAt: params.subscription.updatedAt,
        },
        { merge: true }
      );
      if (sessionRef) transaction.delete(sessionRef);
      return 'pending_claim';
    }

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

export async function claimPendingSubscriptions(params: {
  db: Firestore;
  userId: string;
  normalizedEmail: string;
}): Promise<number> {
  assertValidUserId(params.userId);
  const pendingEmailHash = hashBillingEmail(params.normalizedEmail);
  const pendingSubscriptionsRef = params.db.collection(
    `${PENDING_CLAIMS_COLLECTION}/${pendingEmailHash}/${USER_SUBSCRIPTIONS_COLLECTION}`
  );

  return params.db.runTransaction(async (transaction) => {
    const pendingSnapshot = await transaction.get(pendingSubscriptionsRef);
    if (pendingSnapshot.docs.length === 0) return 0;

    const aggregateRef = params.db.doc(`users/${params.userId}/billing/subscription`);
    const userSubscriptionsRef = params.db.collection(`users/${params.userId}/${USER_SUBSCRIPTIONS_COLLECTION}`);
    const aggregateSnapshot = await transaction.get(aggregateRef);
    const userSubscriptionsSnapshot = await transaction.get(userSubscriptionsRef);
    const indexSnapshots = await Promise.all(
      pendingSnapshot.docs.map((snapshot) =>
        transaction.get(params.db.collection(SUBSCRIPTION_INDEX_COLLECTION).doc(snapshot.id))
      )
    );

    const subscriptionsById = new Map<string, SubscriptionWriteModel>();
    userSubscriptionsSnapshot.docs.forEach((snapshot) => {
      const subscription = snapshot.data();
      if (isSubscriptionWriteModel(subscription)) subscriptionsById.set(snapshot.id, subscription);
    });
    const legacyAggregate = aggregateSnapshot.data();
    if (isSubscriptionWriteModel(legacyAggregate) && !subscriptionsById.has(legacyAggregate.subscriptionId)) {
      subscriptionsById.set(legacyAggregate.subscriptionId, legacyAggregate);
    }

    let claimedCount = 0;
    pendingSnapshot.docs.forEach((pendingSnapshotDocument, index) => {
      const pendingSubscription = pendingSnapshotDocument.data();
      const indexSnapshot = indexSnapshots[index];
      if (
        !isSubscriptionWriteModel(pendingSubscription) ||
        !indexSnapshot?.exists ||
        indexSnapshot.get('pendingEmailHash') !== pendingEmailHash ||
        typeof indexSnapshot.get('userId') === 'string'
      ) {
        return;
      }

      const currentSubscription = subscriptionsById.get(pendingSubscription.subscriptionId);
      const selectedSubscription =
        currentSubscription && currentSubscription.providerUpdatedAt > pendingSubscription.providerUpdatedAt
          ? currentSubscription
          : pendingSubscription;
      subscriptionsById.set(selectedSubscription.subscriptionId, selectedSubscription);
      transaction.set(
        userSubscriptionsRef.doc(selectedSubscription.subscriptionId),
        createSubscriptionFirestoreUpdate(selectedSubscription),
        { merge: true }
      );
      transaction.set(
        params.db.collection(SUBSCRIPTION_INDEX_COLLECTION).doc(selectedSubscription.subscriptionId),
        {
          userId: params.userId,
          pendingEmailHash: FieldValue.delete(),
          subscriptionId: selectedSubscription.subscriptionId,
          updatedAt: selectedSubscription.updatedAt,
        },
        { merge: true }
      );
      transaction.delete(pendingSnapshotDocument.ref);
      claimedCount += 1;
    });

    if (claimedCount > 0) {
      const selectedEntitlement = selectEntitlementSubscription([...subscriptionsById.values()], Date.now());
      if (!selectedEntitlement) throw new Error('Could not resolve the claimed billing entitlement');
      transaction.set(aggregateRef, createSubscriptionFirestoreUpdate(selectedEntitlement), { merge: true });
    }
    return claimedCount;
  });
}
