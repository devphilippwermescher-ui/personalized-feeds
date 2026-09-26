export type BillingInterval = 'monthly' | 'annual';
export type BillingCurrency = 'EUR' | 'USD';

export interface LemonSqueezySubscriptionAttributes {
  store_id: number;
  customer_id: number;
  variant_id: number;
  user_email: string;
  status: string;
  cancelled: boolean;
  renews_at: string | null;
  ends_at: string | null;
  updated_at: string;
  test_mode: boolean;
}

export interface LemonSqueezySubscriptionWebhook {
  meta: {
    event_name: string;
    custom_data?: Record<string, unknown>;
  };
  data: {
    type: string;
    id: string;
    attributes: LemonSqueezySubscriptionAttributes;
  };
}

export type LemonSqueezyPaymentEventName =
  | 'subscription_payment_failed'
  | 'subscription_payment_success'
  | 'subscription_payment_recovered';

export interface LemonSqueezySubscriptionInvoiceWebhook {
  meta: {
    event_name: LemonSqueezyPaymentEventName;
  };
  data: {
    type: 'subscription-invoices';
    id: string;
    attributes: {
      store_id: number;
      subscription_id: number;
      customer_id: number;
      user_email: string;
      billing_reason: string;
      status: 'pending' | 'paid' | 'void' | 'refunded' | 'partial_refund';
      updated_at: string;
      test_mode: boolean;
    };
  };
}

export interface LemonSqueezyWebhookEnvelope {
  meta: {
    event_name: string;
    custom_data?: Record<string, unknown>;
  };
  data: {
    type: string;
    id: string;
    attributes: unknown;
  };
}

export interface BillingStoreConfiguration {
  currency: BillingCurrency;
  storeId: string;
  variants: Record<BillingInterval, string>;
}

export interface BillingConfiguration {
  stores: {
    USD: BillingStoreConfiguration;
    EUR?: BillingStoreConfiguration;
  };
  testMode: boolean;
  checkoutSuccessUrl: string;
}
