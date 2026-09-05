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
});
