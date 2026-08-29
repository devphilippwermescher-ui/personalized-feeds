import type { BillingConfiguration, BillingInterval } from './types.js';

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getBillingConfiguration(): BillingConfiguration {
  return {
    storeId: requireEnvironmentValue('LEMON_SQUEEZY_STORE_ID'),
    variants: {
      monthly: requireEnvironmentValue('LEMON_SQUEEZY_MONTHLY_VARIANT_ID'),
      annual: requireEnvironmentValue('LEMON_SQUEEZY_ANNUAL_VARIANT_ID'),
    },
    testMode: requireEnvironmentValue('LEMON_SQUEEZY_TEST_MODE').toLowerCase() === 'true',
  };
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'annual';
}

export function getBillingIntervalForVariant(
  configuration: BillingConfiguration,
  variantId: string
): BillingInterval | null {
  if (configuration.variants.monthly === variantId) return 'monthly';
  if (configuration.variants.annual === variantId) return 'annual';
  return null;
}
