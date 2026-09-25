import { describe, expect, it } from 'vitest';
import { isAllowedWebsiteOrigin, parseWebsiteCheckoutRequest, WebsiteCheckoutError } from '../website-checkout.js';

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
});
