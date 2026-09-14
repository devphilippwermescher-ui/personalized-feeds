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
      testMode: true,
    });

    expect(url).toBe('https://example.lemonsqueezy.com/checkout');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestUrl, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe('https://api.lemonsqueezy.com/v1/checkouts');
    expect(request.method).toBe('POST');
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(request.body))).toMatchObject({
      data: {
        attributes: {
          test_mode: true,
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

  it('falls back to the standard checkout link when checkout creation has a transient failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => '{"message":"Internal Server Error"}' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { attributes: { slug: 'my-store' } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { attributes: { slug: 'variant-checkout-id' } } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const url = await createCheckout({
      apiKey: 'test-api-key',
      configuration,
      interval: 'monthly',
      userId: 'firebase-user',
      email: 'developer@example.com',
      testMode: true,
    });

    const checkoutUrl = new URL(url);
    expect(checkoutUrl.origin).toBe('https://my-store.lemonsqueezy.com');
    expect(checkoutUrl.pathname).toBe('/checkout/buy/variant-checkout-id');
    expect(checkoutUrl.searchParams.get('checkout[email]')).toBe('developer@example.com');
    expect(checkoutUrl.searchParams.get('checkout[custom][user_id]')).toBe('firebase-user');
    expect(checkoutUrl.searchParams.get('checkout[custom][billing_interval]')).toBe('monthly');
    expect(checkoutUrl.searchParams.get('checkout[custom][billing_currency]')).toBe('USD');
  });

  it('does not hide a non-transient checkout API error behind the fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => '{"message":"Invalid checkout"}' })
    );

    await expect(
      createCheckout({
        apiKey: 'test-api-key',
        configuration,
        interval: 'monthly',
        userId: 'firebase-user',
        testMode: true,
      })
    ).rejects.toThrow('Lemon Squeezy request failed (422)');
  });
});
