import type { BillingConfiguration, LemonSqueezySubscriptionWebhook } from './types.js';
import { getBillingIntervalForVariant } from './config.js';

const SUBSCRIPTION_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
]);

export interface SubscriptionWriteModel {
  plan: 'pro';
  source: 'lemon_squeezy';
  billingCurrency: 'EUR' | 'USD';
  storeId: string;
  status: string;
  customerId: string;
  subscriptionId: string;
  variantId: string;
  billingInterval: 'monthly' | 'annual';
  renewsAt?: number;
  endsAt?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
  testMode: boolean;
  providerUpdatedAt: number;
  updatedAt: number;
}

function parseProviderDate(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveSubscriptionStatus(eventName: string, providerStatus: string): string {
  switch (eventName) {
    case 'subscription_cancelled':
      return 'cancelled';
    case 'subscription_resumed':
      return 'active';
    case 'subscription_expired':
      return 'expired';
    default:
      return providerStatus;
  }
}

export function isSubscriptionEvent(eventName: string): boolean {
  return SUBSCRIPTION_EVENTS.has(eventName);
}

export function parseSubscriptionWebhook(
  payload: LemonSqueezySubscriptionWebhook,
  configuration: BillingConfiguration,
  receivedAt = Date.now()
): { checkoutSessionId: string | null; subscription: SubscriptionWriteModel } {
  const attributes = payload.data.attributes;
  if (payload.data.type !== 'subscriptions') {
    throw new Error(`Unexpected webhook resource type: ${payload.data.type}`);
  }
  const storeId = String(attributes.store_id);
  const storeConfiguration = Object.values(configuration.stores).find((store) => store?.storeId === storeId);
  if (!storeConfiguration) {
    throw new Error('Webhook store does not match the configured Lemon Squeezy store');
  }
  if (attributes.test_mode !== configuration.testMode) {
    throw new Error('Webhook test mode does not match the current Firebase environment');
  }

  const variantId = String(attributes.variant_id);
  const billingInterval = getBillingIntervalForVariant(storeConfiguration, variantId);
  if (!billingInterval) {
    throw new Error(`Webhook variant is not an allowed Pro variant: ${variantId}`);
  }

  const renewsAt = parseProviderDate(attributes.renews_at);
  const endsAt = parseProviderDate(attributes.ends_at);
  const providerUpdatedAt = parseProviderDate(attributes.updated_at) ?? receivedAt;
  const status = resolveSubscriptionStatus(payload.meta.event_name, attributes.status);
  const customCheckoutSessionId = payload.meta.custom_data?.checkout_session_id;
  const checkoutSessionId =
    typeof customCheckoutSessionId === 'string' && customCheckoutSessionId.length > 0 ? customCheckoutSessionId : null;

  const currentPeriodEnd = endsAt ?? renewsAt;
  return {
    checkoutSessionId,
    subscription: {
      plan: 'pro',
      source: 'lemon_squeezy',
      billingCurrency: storeConfiguration.currency,
      storeId,
      status,
      customerId: String(attributes.customer_id),
      subscriptionId: payload.data.id,
      variantId,
      billingInterval,
      ...(renewsAt === undefined ? {} : { renewsAt }),
      ...(endsAt === undefined ? {} : { endsAt }),
      ...(currentPeriodEnd === undefined ? {} : { currentPeriodEnd }),
      cancelAtPeriodEnd: attributes.cancelled,
      testMode: attributes.test_mode,
      providerUpdatedAt,
      updatedAt: receivedAt,
    },
  };
}
