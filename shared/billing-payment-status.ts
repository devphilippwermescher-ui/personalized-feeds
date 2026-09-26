export type BillingPaymentStatusKind = 'failed' | 'resolved';

export interface BillingPaymentStatus {
  subscriptionId: string;
  invoiceId: string;
  status: BillingPaymentStatusKind;
  eventName: 'subscription_payment_failed' | 'subscription_payment_success' | 'subscription_payment_recovered';
  providerUpdatedAt: number;
  updatedAt: number;
}
