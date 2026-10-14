import type { Firestore } from 'firebase-admin/firestore';
import { paymentEventPriority, type PaymentStatusWriteModel } from './payment-event-state.js';
import type { LemonSqueezyPaymentEventName } from './types.js';

const SUBSCRIPTION_INDEX_COLLECTION = 'billingSubscriptions';

type PaymentStatusSaveResult =
  | 'updated'
  | 'ignored_duplicate'
  | 'ignored_stale'
  | 'ignored_non_entitlement'
  | 'missing_user'
  | 'missing_subscription';

function existingEventPriority(value: unknown): number {
  if (
    value === 'subscription_payment_failed' ||
    value === 'subscription_payment_success' ||
    value === 'subscription_payment_recovered'
  ) {
    return paymentEventPriority(value as LemonSqueezyPaymentEventName);
  }
  return 0;
}

export async function savePaymentStatus(params: {
  db: Firestore;
  paymentStatus: PaymentStatusWriteModel;
}): Promise<PaymentStatusSaveResult> {
  const { db, paymentStatus } = params;
  const indexRef = db.collection(SUBSCRIPTION_INDEX_COLLECTION).doc(paymentStatus.subscriptionId);

  return db.runTransaction(async (transaction) => {
    const indexSnapshot = await transaction.get(indexRef);
    const userId = indexSnapshot.get('userId');
    if (typeof userId !== 'string' || !userId) return 'missing_user';

    const subscriptionRef = db.doc(`users/${userId}/billingSubscriptions/${paymentStatus.subscriptionId}`);
    const aggregateRef = db.doc(`users/${userId}/billing/subscription`);
    const paymentStatusRef = db.doc(`users/${userId}/billing/paymentStatus`);
    const [subscriptionSnapshot, aggregateSnapshot, currentPaymentSnapshot] = await Promise.all([
      transaction.get(subscriptionRef),
      transaction.get(aggregateRef),
      transaction.get(paymentStatusRef),
    ]);

    if (!subscriptionSnapshot.exists) return 'missing_subscription';
    if (aggregateSnapshot.get('subscriptionId') !== paymentStatus.subscriptionId) {
      return 'ignored_non_entitlement';
    }
    if (
      subscriptionSnapshot.get('storeId') !== paymentStatus.storeId ||
      subscriptionSnapshot.get('customerId') !== paymentStatus.customerId ||
      subscriptionSnapshot.get('testMode') !== paymentStatus.testMode
    ) {
      throw new Error('Payment webhook does not match the linked subscription');
    }

    const currentProviderUpdatedAt = currentPaymentSnapshot.get('providerUpdatedAt');
    const currentInvoiceId = currentPaymentSnapshot.get('invoiceId');
    const currentEventName = currentPaymentSnapshot.get('eventName');
    if (typeof currentProviderUpdatedAt === 'number') {
      if (currentProviderUpdatedAt > paymentStatus.providerUpdatedAt) return 'ignored_stale';
      if (
        currentProviderUpdatedAt === paymentStatus.providerUpdatedAt &&
        currentInvoiceId === paymentStatus.invoiceId &&
        existingEventPriority(currentEventName) > paymentEventPriority(paymentStatus.eventName)
      ) {
        return 'ignored_stale';
      }
    }
    if (
      currentProviderUpdatedAt === paymentStatus.providerUpdatedAt &&
      currentInvoiceId === paymentStatus.invoiceId &&
      currentEventName === paymentStatus.eventName
    ) {
      return 'ignored_duplicate';
    }

    transaction.set(paymentStatusRef, paymentStatus);
    return 'updated';
  });
}
