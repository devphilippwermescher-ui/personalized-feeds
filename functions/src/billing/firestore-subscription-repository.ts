import type { Firestore } from 'firebase-admin/firestore';
import type { SubscriptionWriteModel } from './subscription-state.js';

const SUBSCRIPTION_INDEX_COLLECTION = 'billingSubscriptions';

function assertValidUserId(userId: string): void {
  if (!userId || userId.length > 128 || userId.includes('/')) {
    throw new Error('Webhook contains an invalid Firebase user ID');
  }
}

export async function saveSubscription(params: {
  db: Firestore;
  customUserId: string | null;
  subscription: SubscriptionWriteModel;
}): Promise<'updated' | 'ignored_stale' | 'missing_user'> {
  const indexRef = params.db.collection(SUBSCRIPTION_INDEX_COLLECTION).doc(params.subscription.subscriptionId);

  return params.db.runTransaction(async (transaction) => {
    const indexSnapshot = await transaction.get(indexRef);
    const indexedUserId = indexSnapshot.exists ? indexSnapshot.get('userId') : null;
    const userId = params.customUserId ?? (typeof indexedUserId === 'string' ? indexedUserId : null);

    if (!userId) return 'missing_user';
    assertValidUserId(userId);
    if (indexedUserId && indexedUserId !== userId) {
      throw new Error('Subscription is already linked to another Firebase user');
    }

    const subscriptionRef = params.db.doc(`users/${userId}/billing/subscription`);
    const currentSnapshot = await transaction.get(subscriptionRef);
    const currentProviderUpdatedAt = currentSnapshot.get('providerUpdatedAt');
    if (
      typeof currentProviderUpdatedAt === 'number' &&
      currentProviderUpdatedAt > params.subscription.providerUpdatedAt
    ) {
      return 'ignored_stale';
    }

    transaction.set(subscriptionRef, params.subscription, { merge: true });
    transaction.set(
      indexRef,
      {
        userId,
        subscriptionId: params.subscription.subscriptionId,
        updatedAt: params.subscription.updatedAt,
      },
      { merge: true }
    );
    return 'updated';
  });
}
