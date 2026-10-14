import { describe, expect, it } from 'vitest';
import {
  getWebsiteCheckoutErrorBody,
  isAllowedWebsiteOrigin,
  parseWebsiteCheckoutRequest,
  WebsiteCheckoutError,
} from '../website-checkout.js';

describe('website checkout request validation', () => {
  it.each([
    ['USD', 'monthly'],
    ['USD', 'annual'],
    ['EUR', 'monthly'],
    ['EUR', 'annual'],
  ] as const)('accepts %s %s', (currency, interval) => {
    expect(parseWebsiteCheckoutRequest({ currency, interval })).toEqual({ currency, interval });
  });

  it('accepts only the expected opaque handoff format', () => {
    const handoffToken = 'a'.repeat(43);
    expect(parseWebsiteCheckoutRequest({ currency: 'USD', interval: 'monthly', handoffToken })).toEqual({
      currency: 'USD',
      interval: 'monthly',
      handoffToken,
    });
    expect(() =>
      parseWebsiteCheckoutRequest({ currency: 'USD', interval: 'monthly', handoffToken: 'firebase-uid' })
    ).toThrowError(WebsiteCheckoutError);
  });

  it('allows only the production site, Lovable previews, and local development origins', () => {
    expect(isAllowedWebsiteOrigin('https://myfeedpilot.com')).toBe(true);
    expect(isAllowedWebsiteOrigin('https://www.myfeedpilot.com')).toBe(true);
    expect(isAllowedWebsiteOrigin('https://preview-name.lovable.app')).toBe(true);
    expect(isAllowedWebsiteOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedWebsiteOrigin('https://myfeedpilot.com.attacker.example')).toBe(false);
    expect(isAllowedWebsiteOrigin('https://lovable.app.attacker.example')).toBe(false);
  });

  it('preserves safe checkout conflict details without exposing a checkout URL', () => {
    const error = new WebsiteCheckoutError(
      409,
      'CHECKOUT_IN_PROGRESS',
      'A USD checkout is already open. To switch, try again in 5 min.',
      {
        state: 'ready',
        currency: 'USD',
        interval: 'monthly',
        retryAfterSeconds: 299,
      }
    );

    expect(getWebsiteCheckoutErrorBody(error)).toEqual({
      error: {
        code: 'CHECKOUT_IN_PROGRESS',
        message: 'A USD checkout is already open. To switch, try again in 5 min.',
        details: {
          state: 'ready',
          currency: 'USD',
          interval: 'monthly',
          retryAfterSeconds: 299,
        },
      },
    });
    expect(error.details).not.toHaveProperty('checkoutUrl');
  });

  it('represents an in-progress handoff as a retryable conflict', () => {
    const error = new WebsiteCheckoutError(
      409,
      'HANDOFF_IN_PROGRESS',
      'Checkout is still opening. Please wait a moment.'
    );

    expect(getWebsiteCheckoutErrorBody(error)).toEqual({
      error: {
        code: 'HANDOFF_IN_PROGRESS',
        message: 'Checkout is still opening. Please wait a moment.',
      },
    });
  });
});
