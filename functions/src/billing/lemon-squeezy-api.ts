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

interface StoreAttributes {
  slug: string;
}

interface VariantAttributes {
  slug: string;
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

function requireCheckoutSlug(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]+$/.test(value)) {
    throw new Error(`Lemon Squeezy returned an invalid ${label} slug`);
  }
  return value;
}

async function createStandardCheckoutUrl(params: {
  apiKey: string;
  configuration: BillingStoreConfiguration;
  interval: BillingInterval;
  userId: string;
  email?: string;
}): Promise<string> {
  const variantId = params.configuration.variants[params.interval];
  const [store, variant] = await Promise.all([
    requestLemonSqueezy<LemonSqueezyResource<StoreAttributes>>(
      params.apiKey,
      `/stores/${encodeURIComponent(params.configuration.storeId)}`
    ),
    requestLemonSqueezy<LemonSqueezyResource<VariantAttributes>>(
      params.apiKey,
      `/variants/${encodeURIComponent(variantId)}`
    ),
  ]);
  const storeSlug = requireCheckoutSlug(store.data.attributes.slug, 'store');
  const variantSlug = requireCheckoutSlug(variant.data.attributes.slug, 'variant');
  const url = new URL(`https://${storeSlug}.lemonsqueezy.com/checkout/buy/${variantSlug}`);

  if (params.email) url.searchParams.set('checkout[email]', params.email);
  url.searchParams.set('checkout[custom][user_id]', params.userId);
  url.searchParams.set('checkout[custom][billing_interval]', params.interval);
  url.searchParams.set('checkout[custom][billing_currency]', params.configuration.currency);

  return url.toString();
}

export async function createCheckout(params: {
  apiKey: string;
  configuration: BillingStoreConfiguration;
  interval: BillingInterval;
  userId: string;
  email?: string;
  testMode: boolean;
}): Promise<string> {
  const variantId = params.configuration.variants[params.interval];
  try {
    const response = await requestLemonSqueezy<LemonSqueezyResource<CheckoutAttributes>>(
      params.apiKey,
      '/checkouts',
      {
        method: 'POST',
        signal: AbortSignal.timeout(4_000),
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              test_mode: params.testMode,
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
      }
    );

    const url = response.data.attributes.url?.trim();
    if (!url) {
      throw new Error('Lemon Squeezy did not return a checkout URL');
    }
    return url;
  } catch (error) {
    const canUseStandardCheckout =
      !(error instanceof LemonSqueezyRequestError) || error.status === 429 || error.status >= 500;
    if (!canUseStandardCheckout) throw error;
    return createStandardCheckoutUrl(params);
  }
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
