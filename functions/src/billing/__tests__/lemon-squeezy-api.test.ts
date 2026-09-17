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
  it('uses the allowlisted variant and attaches only the opaque checkout session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { attributes: { url: 'https://example.lemonsqueezy.com/checkout' } } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = await createCheckout({
      apiKey: 'test-api-key',
      configuration,
      interval: 'annual',
      checkoutSessionId: 'opaque-session-id',
      expiresAt: Date.parse('2026-09-17T12:30:00.000Z'),
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
          expires_at: '2026-09-17T12:30:00.000Z',
          checkout_data: {
            email: 'developer@example.com',
            custom: {
              checkout_session_id: 'opaque-session-id',
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

  it('does not expose an editable standard checkout fallback after a transient API failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => '{"message":"Internal Server Error"}' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createCheckout({
        apiKey: 'test-api-key',
        configuration,
        interval: 'monthly',
        checkoutSessionId: 'opaque-session-id',
        expiresAt: Date.parse('2026-09-17T12:30:00.000Z'),
        email: 'developer@example.com',
        testMode: true,
      })
    ).rejects.toThrow('Lemon Squeezy request failed (500)');
    expect(fetchMock).toHaveBeenCalledOnce();
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
        checkoutSessionId: 'opaque-session-id',
        expiresAt: Date.parse('2026-09-17T12:30:00.000Z'),
        testMode: true,
      })
    ).rejects.toThrow('Lemon Squeezy request failed (422)');
  });
});
