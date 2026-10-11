import type { BillingConfiguration, BillingCurrency, BillingInterval, BillingStoreConfiguration } from './types.js';

const FIREBASE_PROJECT_MODE = {
  'myfeedpilot-dev': true,
  'myfeedpilot-staging': true,
  'myfeedpilot-production': false,
} as const;

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

function parsePositiveIntegerId(value: string, name: string): string {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function requirePositiveIntegerId(...names: string[]): string {
  return parsePositiveIntegerId(requireEnvironmentValue(...names), names[0]);
}

function parseTestMode(): boolean {
  const value = requireEnvironmentValue('LEMON_SQUEEZY_TEST_MODE');
  if (value !== 'true' && value !== 'false') {
    throw new Error('LEMON_SQUEEZY_TEST_MODE must be exactly true or false');
  }
  return value === 'true';
}

function getFirebaseProjectId(): string | undefined {
  const explicitProjectId = getEnvironmentValue('GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT');
  if (explicitProjectId) return explicitProjectId;

  const firebaseConfig = getEnvironmentValue('FIREBASE_CONFIG');
  if (!firebaseConfig) return undefined;
  try {
    const parsed = JSON.parse(firebaseConfig) as { projectId?: unknown };
    return typeof parsed.projectId === 'string' && parsed.projectId.trim() ? parsed.projectId.trim() : undefined;
  } catch {
    throw new Error('FIREBASE_CONFIG must contain valid JSON');
  }
}

function assertEnvironmentMode(testMode: boolean): void {
  const projectId = getFirebaseProjectId();
  if (!projectId || !(projectId in FIREBASE_PROJECT_MODE)) return;

  const expectedTestMode = FIREBASE_PROJECT_MODE[projectId as keyof typeof FIREBASE_PROJECT_MODE];
  if (testMode !== expectedTestMode) {
    throw new Error(`${projectId} requires LEMON_SQUEEZY_TEST_MODE=${expectedTestMode ? 'true' : 'false'}`);
  }
}

function assertUniqueStoreConfiguration(stores: BillingStoreConfiguration[]): void {
  const storeIds = stores.map((store) => store.storeId);
  if (new Set(storeIds).size !== storeIds.length) {
    throw new Error('Lemon Squeezy Store IDs must be unique');
  }

  const variantIds = stores.flatMap((store) => [store.variants.monthly, store.variants.annual]);
  if (new Set(variantIds).size !== variantIds.length) {
    throw new Error('Lemon Squeezy Variant IDs must be unique');
  }
}

function getUsdStoreConfiguration(): BillingStoreConfiguration {
  return {
    currency: 'USD',
    // Keep the original names as a local-only compatibility fallback.
    storeId: requirePositiveIntegerId('LEMON_SQUEEZY_USD_STORE_ID', 'LEMON_SQUEEZY_STORE_ID'),
    variants: {
      monthly: requirePositiveIntegerId('LEMON_SQUEEZY_USD_MONTHLY_VARIANT_ID', 'LEMON_SQUEEZY_MONTHLY_VARIANT_ID'),
      annual: requirePositiveIntegerId('LEMON_SQUEEZY_USD_ANNUAL_VARIANT_ID', 'LEMON_SQUEEZY_ANNUAL_VARIANT_ID'),
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
    storeId: parsePositiveIntegerId(storeId as string, 'LEMON_SQUEEZY_EUR_STORE_ID'),
    variants: {
      monthly: parsePositiveIntegerId(monthlyVariantId as string, 'LEMON_SQUEEZY_EUR_MONTHLY_VARIANT_ID'),
      annual: parsePositiveIntegerId(annualVariantId as string, 'LEMON_SQUEEZY_EUR_ANNUAL_VARIANT_ID'),
    },
  };
}

export function getBillingConfiguration(): BillingConfiguration {
  const testMode = parseTestMode();
  assertEnvironmentMode(testMode);

  const usdStore = getUsdStoreConfiguration();
  const eurStore = getOptionalEurStoreConfiguration();
  assertUniqueStoreConfiguration([usdStore, ...(eurStore ? [eurStore] : [])]);

  const checkoutSuccessUrl =
    getEnvironmentValue('BILLING_CHECKOUT_SUCCESS_URL') ?? 'https://myfeedpilot.com/checkout/success';
  const parsedSuccessUrl = new URL(checkoutSuccessUrl);
  if (parsedSuccessUrl.protocol !== 'https:') {
    throw new Error('BILLING_CHECKOUT_SUCCESS_URL must use HTTPS');
  }
  return {
    stores: {
      USD: usdStore,
      ...(eurStore ? { EUR: eurStore } : {}),
    },
    testMode,
    checkoutSuccessUrl: parsedSuccessUrl.toString(),
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
