import type {
  BillingConfiguration,
  LemonSqueezyPaymentEventName,
  LemonSqueezySubscriptionInvoiceWebhook,
} from './types.js';

const PAYMENT_EVENTS = new Set<LemonSqueezyPaymentEventName>([
  'subscription_payment_failed',
  'subscription_payment_success',
  'subscription_payment_recovered',
]);

export interface PaymentStatusWriteModel {
  subscriptionId: string;
  invoiceId: string;
  storeId: string;
  customerId: string;
  status: 'failed' | 'resolved';
  eventName: LemonSqueezyPaymentEventName;
  providerUpdatedAt: number;
  updatedAt: number;
  testMode: boolean;
}

export function isSubscriptionPaymentEvent(eventName: string): eventName is LemonSqueezyPaymentEventName {
  return PAYMENT_EVENTS.has(eventName as LemonSqueezyPaymentEventName);
}

export function paymentEventPriority(eventName: LemonSqueezyPaymentEventName): number {
  if (eventName === 'subscription_payment_recovered') return 3;
  if (eventName === 'subscription_payment_success') return 2;
  return 1;
}

export function parseSubscriptionPaymentWebhook(
  payload: LemonSqueezySubscriptionInvoiceWebhook,
  configuration: BillingConfiguration,
  receivedAt = Date.now()
): PaymentStatusWriteModel {
  const attributes = payload.data.attributes;
  const storeId = String(attributes.store_id);
  const storeConfiguration = Object.values(configuration.stores).find((store) => store?.storeId === storeId);
  if (!storeConfiguration) {
    throw new Error('Payment webhook store does not match the configured Lemon Squeezy store');
  }
  if (attributes.test_mode !== configuration.testMode) {
    throw new Error('Payment webhook test mode does not match the current Firebase environment');
  }

  const providerUpdatedAt = Date.parse(attributes.updated_at);
  if (!Number.isFinite(providerUpdatedAt)) throw new Error('Payment webhook contains an invalid update date');

  return {
    subscriptionId: String(attributes.subscription_id),
    invoiceId: payload.data.id,
    storeId,
    customerId: String(attributes.customer_id),
    status: payload.meta.event_name === 'subscription_payment_failed' ? 'failed' : 'resolved',
    eventName: payload.meta.event_name,
    providerUpdatedAt,
    updatedAt: receivedAt,
    testMode: attributes.test_mode,
  };
}
