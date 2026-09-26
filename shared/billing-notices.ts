import type { BillingSubscription } from './plans';
import type { BillingPaymentStatus } from './billing-payment-status';

export type BillingNoticeKind = 'ending_soon' | 'payment_failed' | 'expired';
export type BillingNoticeAction = 'portal' | 'pricing';

export interface BillingNotice {
  id: string;
  kind: BillingNoticeKind;
  action: BillingNoticeAction;
  endsAt?: number;
}

export const BILLING_ENDING_WARNING_MS = 7 * 24 * 60 * 60 * 1_000;

function noticeTimestamp(subscription: BillingSubscription): number {
  return (
    subscription.endsAt ??
    subscription.currentPeriodEnd ??
    subscription.renewsAt ??
    subscription.providerUpdatedAt ??
    subscription.updatedAt ??
    0
  );
}

function noticeId(kind: BillingNoticeKind, subscription: BillingSubscription, timestamp: number): string {
  return `${kind}--${subscription.subscriptionId || 'subscription'}--${timestamp}`;
}

export function resolveBillingNotice(
  subscription: BillingSubscription | null | undefined,
  now = Date.now(),
  paymentStatus?: BillingPaymentStatus | null
): BillingNotice | null {
  if (!subscription?.subscriptionId) return null;

  const paidUntil = subscription.endsAt ?? subscription.currentPeriodEnd;
  const hasEnded =
    subscription.status === 'expired' ||
    (subscription.status === 'cancelled' && paidUntil !== undefined && paidUntil <= now);
  if (hasEnded) {
    return {
      id: noticeId('expired', subscription, paidUntil ?? noticeTimestamp(subscription)),
      kind: 'expired',
      action: 'pricing',
    };
  }

  const matchingPaymentStatus = paymentStatus?.subscriptionId === subscription.subscriptionId ? paymentStatus : null;
  const subscriptionReceivedAt = subscription.updatedAt ?? 0;
  if (
    matchingPaymentStatus?.status === 'failed' &&
    (subscription.status === 'past_due' || matchingPaymentStatus.updatedAt >= subscriptionReceivedAt)
  ) {
    return {
      id: `payment_failed--${subscription.subscriptionId}--${matchingPaymentStatus.invoiceId}`,
      kind: 'payment_failed',
      action: 'portal',
    };
  }

  const hasNewerResolution =
    matchingPaymentStatus?.status === 'resolved' && matchingPaymentStatus.updatedAt >= subscriptionReceivedAt;
  if (subscription.status === 'past_due' && !hasNewerResolution) {
    const timestamp = subscription.renewsAt ?? subscription.currentPeriodEnd ?? noticeTimestamp(subscription);
    return {
      id: noticeId('payment_failed', subscription, timestamp),
      kind: 'payment_failed',
      action: 'portal',
    };
  }

  const willEnd = subscription.status === 'cancelled' || subscription.cancelAtPeriodEnd === true;
  if (willEnd && paidUntil !== undefined && paidUntil > now && paidUntil - now <= BILLING_ENDING_WARNING_MS) {
    return {
      id: noticeId('ending_soon', subscription, paidUntil),
      kind: 'ending_soon',
      action: 'portal',
      endsAt: paidUntil,
    };
  }

  return null;
}
