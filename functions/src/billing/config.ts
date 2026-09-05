import type { BillingConfiguration, BillingCurrency, BillingInterval, BillingStoreConfiguration } from './types.js';

function getEnvironmentValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function requireEnvironmentValue(...names: string[]): string {
  const value = getEnvironmentValue(...names);
  if (!value) {
    throw new Error(`${names[0]} is not configured`);
  }
  return value;
}

function getUsdStoreConfiguration(): BillingStoreConfiguration {
  return {
    currency: 'USD',
    // Keep the original names as a local-only compatibility fallback.
    storeId: requireEnvironmentValue('LEMON_SQUEEZY_USD_STORE_ID', 'LEMON_SQUEEZY_STORE_ID'),
    variants: {
      monthly: requireEnvironmentValue('LEMON_SQUEEZY_USD_MONTHLY_VARIANT_ID', 'LEMON_SQUEEZY_MONTHLY_VARIANT_ID'),
      annual: requireEnvironmentValue('LEMON_SQUEEZY_USD_ANNUAL_VARIANT_ID', 'LEMON_SQUEEZY_ANNUAL_VARIANT_ID'),
    },
  };
}

function getOptionalEurStoreConfiguration(): BillingStoreConfiguration | undefined {
  const storeId = getEnvironmentValue('LEMON_SQUEEZY_EUR_STORE_ID');
  const monthlyVariantId = getEnvironmentValue('LEMON_SQUEEZY_EUR_MONTHLY_VARIANT_ID');
  const annualVariantId = getEnvironmentValue('LEMON_SQUEEZY_EUR_ANNUAL_VARIANT_ID');
  const configuredValues = [storeId, monthlyVariantId, annualVariantId].filter(Boolean).length;

  if (configuredValues === 0) return undefined;
  if (configuredValues !== 3) {
    throw new Error('EUR Lemon Squeezy configuration is incomplete');
  }

  return {
    currency: 'EUR',
    storeId: storeId as string,
    variants: {
      monthly: monthlyVariantId as string,
      annual: annualVariantId as string,
    },
  };
}

export function getBillingConfiguration(): BillingConfiguration {
  const eurStore = getOptionalEurStoreConfiguration();
  return {
    stores: {
      USD: getUsdStoreConfiguration(),
      ...(eurStore ? { EUR: eurStore } : {}),
    },
    testMode: requireEnvironmentValue('LEMON_SQUEEZY_TEST_MODE').toLowerCase() === 'true',
  };
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'annual';
}

export function isBillingCurrency(value: unknown): value is BillingCurrency {
  return value === 'EUR' || value === 'USD';
}

export function getBillingIntervalForVariant(
  configuration: BillingStoreConfiguration,
  variantId: string
): BillingInterval | null {
  if (configuration.variants.monthly === variantId) return 'monthly';
  if (configuration.variants.annual === variantId) return 'annual';
  return null;
}
