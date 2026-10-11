import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBillingConfiguration } from '../config.js';

const BILLING_ENVIRONMENT_NAMES = [
  'LEMON_SQUEEZY_STORE_ID',
  'LEMON_SQUEEZY_MONTHLY_VARIANT_ID',
  'LEMON_SQUEEZY_ANNUAL_VARIANT_ID',
  'LEMON_SQUEEZY_USD_STORE_ID',
  'LEMON_SQUEEZY_USD_MONTHLY_VARIANT_ID',
  'LEMON_SQUEEZY_USD_ANNUAL_VARIANT_ID',
  'LEMON_SQUEEZY_EUR_STORE_ID',
  'LEMON_SQUEEZY_EUR_MONTHLY_VARIANT_ID',
  'LEMON_SQUEEZY_EUR_ANNUAL_VARIANT_ID',
  'LEMON_SQUEEZY_TEST_MODE',
  'GCLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
  'FIREBASE_CONFIG',
] as const;

function clearBillingEnvironment(): void {
  BILLING_ENVIRONMENT_NAMES.forEach((name) => vi.stubEnv(name, ''));
}

function configureUsd(): void {
  vi.stubEnv('LEMON_SQUEEZY_USD_STORE_ID', '42');
  vi.stubEnv('LEMON_SQUEEZY_USD_MONTHLY_VARIANT_ID', '100');
  vi.stubEnv('LEMON_SQUEEZY_USD_ANNUAL_VARIANT_ID', '101');
  vi.stubEnv('LEMON_SQUEEZY_TEST_MODE', 'true');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Lemon Squeezy billing configuration', () => {
  it('requires USD but allows EUR to remain unavailable', () => {
    clearBillingEnvironment();
    configureUsd();

    expect(getBillingConfiguration()).toEqual({
      stores: {
        USD: {
          currency: 'USD',
          storeId: '42',
          variants: { monthly: '100', annual: '101' },
        },
      },
      testMode: true,
      checkoutSuccessUrl: 'https://myfeedpilot.com/checkout/success',
    });
  });

  it('adds EUR when all three EUR identifiers are configured', () => {
    clearBillingEnvironment();
    configureUsd();
    vi.stubEnv('LEMON_SQUEEZY_EUR_STORE_ID', '84');
    vi.stubEnv('LEMON_SQUEEZY_EUR_MONTHLY_VARIANT_ID', '200');
    vi.stubEnv('LEMON_SQUEEZY_EUR_ANNUAL_VARIANT_ID', '201');

    expect(getBillingConfiguration().stores.EUR).toEqual({
      currency: 'EUR',
      storeId: '84',
      variants: { monthly: '200', annual: '201' },
    });
  });

  it('rejects a partially configured EUR store', () => {
    clearBillingEnvironment();
    configureUsd();
    vi.stubEnv('LEMON_SQUEEZY_EUR_STORE_ID', '84');

    expect(() => getBillingConfiguration()).toThrow('EUR Lemon Squeezy configuration is incomplete');
  });

  it('keeps the original USD names as a local compatibility fallback', () => {
    clearBillingEnvironment();
    vi.stubEnv('LEMON_SQUEEZY_STORE_ID', '42');
    vi.stubEnv('LEMON_SQUEEZY_MONTHLY_VARIANT_ID', '100');
    vi.stubEnv('LEMON_SQUEEZY_ANNUAL_VARIANT_ID', '101');
    vi.stubEnv('LEMON_SQUEEZY_TEST_MODE', 'true');

    expect(getBillingConfiguration().stores.USD.storeId).toBe('42');
  });

  it('rejects invalid boolean and non-numeric identifiers', () => {
    clearBillingEnvironment();
    configureUsd();
    vi.stubEnv('LEMON_SQUEEZY_TEST_MODE', 'yes');
    expect(() => getBillingConfiguration()).toThrow('LEMON_SQUEEZY_TEST_MODE must be exactly true or false');

    vi.stubEnv('LEMON_SQUEEZY_TEST_MODE', 'TRUE');
    expect(() => getBillingConfiguration()).toThrow('LEMON_SQUEEZY_TEST_MODE must be exactly true or false');

    vi.stubEnv('LEMON_SQUEEZY_TEST_MODE', 'true');
    vi.stubEnv('LEMON_SQUEEZY_USD_MONTHLY_VARIANT_ID', 'monthly');
    expect(() => getBillingConfiguration()).toThrow('LEMON_SQUEEZY_USD_MONTHLY_VARIANT_ID must be a positive integer');
  });

  it('rejects duplicated stores and variants', () => {
    clearBillingEnvironment();
    configureUsd();
    vi.stubEnv('LEMON_SQUEEZY_EUR_STORE_ID', '42');
    vi.stubEnv('LEMON_SQUEEZY_EUR_MONTHLY_VARIANT_ID', '200');
    vi.stubEnv('LEMON_SQUEEZY_EUR_ANNUAL_VARIANT_ID', '201');
    expect(() => getBillingConfiguration()).toThrow('Lemon Squeezy Store IDs must be unique');

    vi.stubEnv('LEMON_SQUEEZY_EUR_STORE_ID', '84');
    vi.stubEnv('LEMON_SQUEEZY_EUR_MONTHLY_VARIANT_ID', '100');
    expect(() => getBillingConfiguration()).toThrow('Lemon Squeezy Variant IDs must be unique');
  });

  it('requires Test mode in staging and Live mode in production', () => {
    clearBillingEnvironment();
    configureUsd();
    vi.stubEnv('GCLOUD_PROJECT', 'myfeedpilot-staging');
    expect(getBillingConfiguration().testMode).toBe(true);

    vi.stubEnv('GCLOUD_PROJECT', 'myfeedpilot-production');
    expect(() => getBillingConfiguration()).toThrow('myfeedpilot-production requires LEMON_SQUEEZY_TEST_MODE=false');

    vi.stubEnv('LEMON_SQUEEZY_TEST_MODE', 'false');
    expect(getBillingConfiguration().testMode).toBe(false);
  });

  it('reads the Firebase project from FIREBASE_CONFIG when GCLOUD_PROJECT is unavailable', () => {
    clearBillingEnvironment();
    configureUsd();
    vi.stubEnv('LEMON_SQUEEZY_TEST_MODE', 'false');
    vi.stubEnv('FIREBASE_CONFIG', JSON.stringify({ projectId: 'myfeedpilot-staging' }));

    expect(() => getBillingConfiguration()).toThrow('myfeedpilot-staging requires LEMON_SQUEEZY_TEST_MODE=true');
  });
});
