import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCheckout,
  getCustomerPortalUrl,
  isTransientLemonSqueezyError,
  LemonSqueezyRequestError,
} from '../lemon-squeezy-api.js';
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
      json: async () => ({
        data: { attributes: { url: 'https://example.lemonsqueezy.com/checkout/custom/checkout-id' } },
      }),
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
      redirectUrl: 'https://myfeedpilot.com/checkout/success',
    });

    expect(url).toBe('https://example.lemonsqueezy.com/checkout/custom/checkout-id');
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
          product_options: {
            enabled_variants: [2069645],
            redirect_url: 'https://myfeedpilot.com/checkout/success',
          },
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

  it('rejects an invalid configured variant before calling Lemon Squeezy', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createCheckout({
        apiKey: 'test-api-key',
        configuration: {
          ...configuration,
          variants: { ...configuration.variants, monthly: 'invalid' },
        },
        interval: 'monthly',
        checkoutSessionId: 'opaque-session-id',
        expiresAt: Date.parse('2026-09-17T12:30:00.000Z'),
        testMode: true,
      })
    ).rejects.toThrow('Lemon Squeezy variant ID must be a positive integer');
    expect(fetchMock).not.toHaveBeenCalled();
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
    ).rejects.toMatchObject({
      name: 'LemonSqueezyRequestError',
      kind: 'server',
      status: 500,
      message: 'Lemon Squeezy request failed (500)',
    });
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

  it.each([
    [401, 'authentication'],
    [403, 'authentication'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [503, 'server'],
  ] as const)('classifies provider HTTP %s as %s', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));

    await expect(getCustomerPortalUrl('test-api-key', 'subscription-id')).rejects.toMatchObject({ status, kind });
  });

  it('rejects checkout URLs outside the Lemon Squeezy HTTPS checkout origin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { attributes: { url: 'https://store.lemonsqueezy.com.attacker.example/checkout/custom/id' } },
        }),
      })
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
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('classifies a malformed success payload as an invalid provider response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
    );

    await expect(getCustomerPortalUrl('test-api-key', 'subscription-id')).rejects.toMatchObject({
      kind: 'invalid_response',
      status: undefined,
    });
  });

  it('applies a timeout and validates the signed customer portal URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          attributes: {
            urls: {
              customer_portal: 'https://my-store.lemonsqueezy.com/billing?expires=123&signature=signed',
            },
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCustomerPortalUrl('test-api-key', 'subscription-id')).resolves.toBe(
      'https://my-store.lemonsqueezy.com/billing?expires=123&signature=signed'
    );
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('classifies request timeouts without exposing provider response details', async () => {
    const timeout = new Error('request body that must not be exposed');
    timeout.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));

    const promise = getCustomerPortalUrl('test-api-key', 'subscription-id');
    await expect(promise).rejects.toBeInstanceOf(LemonSqueezyRequestError);
    await expect(promise).rejects.toMatchObject({
      kind: 'timeout',
      status: undefined,
      message: 'Lemon Squeezy request failed (timeout)',
    });
    expect(isTransientLemonSqueezyError(new LemonSqueezyRequestError('timeout'))).toBe(true);
    expect(isTransientLemonSqueezyError(new LemonSqueezyRequestError('rejected', 422))).toBe(false);
  });
});
