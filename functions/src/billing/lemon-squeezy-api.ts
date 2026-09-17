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

class LemonSqueezyRequestError extends Error {
  constructor(
    readonly status: number,
    details: string
  ) {
    super(`Lemon Squeezy request failed (${status}): ${details.slice(0, 500)}`);
  }
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
    throw new LemonSqueezyRequestError(response.status, details);
  }

  return (await response.json()) as T;
}

export async function createCheckout(params: {
  apiKey: string;
  configuration: BillingStoreConfiguration;
  interval: BillingInterval;
  checkoutSessionId: string;
  expiresAt: number;
  email?: string;
  testMode: boolean;
}): Promise<string> {
  const variantId = params.configuration.variants[params.interval];
  const enabledVariantId = Number(variantId);
  if (!Number.isSafeInteger(enabledVariantId) || enabledVariantId <= 0) {
    throw new Error('Lemon Squeezy variant ID must be a positive integer');
  }
  const response = await requestLemonSqueezy<LemonSqueezyResource<CheckoutAttributes>>(params.apiKey, '/checkouts', {
    method: 'POST',
    signal: AbortSignal.timeout(4_000),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          test_mode: params.testMode,
          expires_at: new Date(params.expiresAt).toISOString(),
          product_options: {
            enabled_variants: [enabledVariantId],
          },
          checkout_data: {
            email: params.email || undefined,
            custom: {
              checkout_session_id: params.checkoutSessionId,
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
