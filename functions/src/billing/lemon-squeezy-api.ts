import type { BillingInterval, BillingStoreConfiguration } from './types.js';

const LEMON_SQUEEZY_API_ORIGIN = 'https://api.lemonsqueezy.com/v1';
const LEMON_SQUEEZY_REQUEST_TIMEOUT_MS = 4_000;

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

export type LemonSqueezyRequestErrorKind =
  | 'authentication'
  | 'not_found'
  | 'rate_limited'
  | 'rejected'
  | 'server'
  | 'timeout'
  | 'network'
  | 'invalid_response';

export class LemonSqueezyRequestError extends Error {
  constructor(
    readonly kind: LemonSqueezyRequestErrorKind,
    readonly status?: number
  ) {
    super(`Lemon Squeezy request failed (${status ?? kind})`);
    this.name = 'LemonSqueezyRequestError';
  }
}

export function isTransientLemonSqueezyError(error: unknown): boolean {
  return (
    error instanceof LemonSqueezyRequestError &&
    (error.kind === 'rate_limited' || error.kind === 'server' || error.kind === 'timeout' || error.kind === 'network')
  );
}

function getRequestErrorKind(status: number): LemonSqueezyRequestErrorKind {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'rejected';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function validateCustomerUrl(value: unknown, pathPrefix: '/checkout/' | '/billing'): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LemonSqueezyRequestError('invalid_response');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LemonSqueezyRequestError('invalid_response');
  }
  const hostname = url.hostname.toLowerCase();
  const isLemonSqueezyHost = hostname === 'lemonsqueezy.com' || hostname.endsWith('.lemonsqueezy.com');
  if (
    url.protocol !== 'https:' ||
    !isLemonSqueezyHost ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith(pathPrefix)
  ) {
    throw new LemonSqueezyRequestError('invalid_response');
  }
  return url.toString();
}

async function requestLemonSqueezy<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${LEMON_SQUEEZY_API_ORIGIN}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(LEMON_SQUEEZY_REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
        ...init.headers,
      },
    });
  } catch (error) {
    throw new LemonSqueezyRequestError(isAbortError(error) ? 'timeout' : 'network');
  }

  if (!response.ok) {
    throw new LemonSqueezyRequestError(getRequestErrorKind(response.status), response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new LemonSqueezyRequestError('invalid_response', response.status);
  }
}

export async function createCheckout(params: {
  apiKey: string;
  configuration: BillingStoreConfiguration;
  interval: BillingInterval;
  checkoutSessionId: string;
  expiresAt: number;
  email?: string;
  testMode: boolean;
  redirectUrl?: string;
}): Promise<string> {
  const variantId = params.configuration.variants[params.interval];
  const enabledVariantId = Number(variantId);
  if (!Number.isSafeInteger(enabledVariantId) || enabledVariantId <= 0) {
    throw new Error('Lemon Squeezy variant ID must be a positive integer');
  }
  const response = await requestLemonSqueezy<LemonSqueezyResource<CheckoutAttributes>>(params.apiKey, '/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          test_mode: params.testMode,
          expires_at: new Date(params.expiresAt).toISOString(),
          product_options: {
            enabled_variants: [enabledVariantId],
            ...(params.redirectUrl ? { redirect_url: params.redirectUrl } : {}),
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

  return validateCustomerUrl(response.data?.attributes?.url, '/checkout/');
}

export async function getCustomerPortalUrl(apiKey: string, subscriptionId: string): Promise<string> {
  const response = await requestLemonSqueezy<LemonSqueezyResource<SubscriptionAttributes>>(
    apiKey,
    `/subscriptions/${encodeURIComponent(subscriptionId)}`
  );
  return validateCustomerUrl(response.data?.attributes?.urls?.customer_portal, '/billing');
}
