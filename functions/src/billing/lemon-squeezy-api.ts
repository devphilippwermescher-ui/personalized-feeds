import type { BillingInterval, BillingStoreConfiguration } from './types.js';

const LEMON_SQUEEZY_API_ORIGIN = 'https://api.lemonsqueezy.com/v1';

interface LemonSqueezyResource<TAttributes> {
  data: {
    attributes: TAttributes;
  };
}

interface CheckoutAttributes {
  url: string;
}

interface SubscriptionAttributes {
  urls?: {
    customer_portal?: string | null;
  };
}

async function requestLemonSqueezy<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${LEMON_SQUEEZY_API_ORIGIN}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Lemon Squeezy request failed (${response.status}): ${details.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}

export async function createCheckout(params: {
  apiKey: string;
  configuration: BillingStoreConfiguration;
  interval: BillingInterval;
  userId: string;
  email?: string;
}): Promise<string> {
  const variantId = params.configuration.variants[params.interval];
  const response = await requestLemonSqueezy<LemonSqueezyResource<CheckoutAttributes>>(params.apiKey, '/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: params.email || undefined,
            custom: {
              user_id: params.userId,
              billing_interval: params.interval,
              billing_currency: params.configuration.currency,
            },
          },
        },
        relationships: {
          store: {
            data: { type: 'stores', id: params.configuration.storeId },
          },
          variant: {
            data: { type: 'variants', id: variantId },
          },
        },
      },
    }),
  });

  const url = response.data.attributes.url?.trim();
  if (!url) {
    throw new Error('Lemon Squeezy did not return a checkout URL');
  }
  return url;
}

export async function getCustomerPortalUrl(apiKey: string, subscriptionId: string): Promise<string> {
  const response = await requestLemonSqueezy<LemonSqueezyResource<SubscriptionAttributes>>(
    apiKey,
    `/subscriptions/${encodeURIComponent(subscriptionId)}`
  );
  const url = response.data.attributes.urls?.customer_portal?.trim();
  if (!url) {
    throw new Error('Lemon Squeezy did not return a customer portal URL');
  }
  return url;
}
