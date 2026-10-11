import { describe, expect, it } from 'vitest';
import { buildAuthenticatedPricingUrl } from '../utils/pricing-page-url';

const HANDOFF_TOKEN = 'a'.repeat(43);

describe('authenticated pricing URL', () => {
  it('routes a staging handoff without exposing an endpoint URL', () => {
    expect(buildAuthenticatedPricingUrl(HANDOFF_TOKEN, 'staging')).toBe(
      `https://myfeedpilot.com/pricing#handoff=${HANDOFF_TOKEN}&checkoutEnvironment=staging`
    );
  });

  it('routes a production handoff explicitly', () => {
    expect(buildAuthenticatedPricingUrl(HANDOFF_TOKEN, 'production')).toBe(
      `https://myfeedpilot.com/pricing#handoff=${HANDOFF_TOKEN}&checkoutEnvironment=production`
    );
  });

  it('rejects unsupported development handoffs and malformed tokens', () => {
    expect(() => buildAuthenticatedPricingUrl(HANDOFF_TOKEN, 'development')).toThrow(
      'Authenticated pricing is available only in staging and production builds.'
    );
    expect(() => buildAuthenticatedPricingUrl('invalid', 'staging')).toThrow(
      'Billing service did not return a valid pricing handoff.'
    );
  });
});
