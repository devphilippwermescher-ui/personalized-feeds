export type BillingInterval = 'monthly' | 'annual';
export type BillingCurrency = 'EUR' | 'USD';

export interface LemonSqueezySubscriptionAttributes {
  store_id: number;
  customer_id: number;
  variant_id: number;
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
}
