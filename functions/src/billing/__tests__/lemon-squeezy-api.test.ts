import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCheckout } from '../lemon-squeezy-api.js';
import type { BillingStoreConfiguration } from '../types.js';

const configuration: BillingStoreConfiguration = {
  currency: 'USD',
  storeId: '42',
  variants: { monthly: '2069629', annual: '2069645' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Lemon Squeezy checkout creation', () => {
  it('uses the allowlisted variant and attaches the Firebase user identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { attributes: { url: 'https://example.lemonsqueezy.com/checkout' } } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await createCheckout({
      apiKey: 'test-api-key',
      configuration,
      interval: 'annual',
      userId: 'firebase-user',
      email: 'developer@example.com',
    });

    expect(url).toBe('https://example.lemonsqueezy.com/checkout');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestUrl, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe('https://api.lemonsqueezy.com/v1/checkouts');
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toMatchObject({
      data: {
        attributes: {
          checkout_data: {
            email: 'developer@example.com',
            custom: {
              user_id: 'firebase-user',
              billing_interval: 'annual',
              billing_currency: 'USD',
            },
          },
        },
        relationships: {
          store: { data: { id: '42' } },
          variant: { data: { id: '2069645' } },
        },
      },
    });
  });
});
