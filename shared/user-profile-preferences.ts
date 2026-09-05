import type { BillingCurrency, UserProfilePreferences } from './types';

export const DEFAULT_BILLING_CURRENCY: BillingCurrency = 'EUR';

export const DEFAULT_USER_PROFILE_PREFERENCES: UserProfilePreferences = {
  displayName: '',
  avatarDataUrl: '',
  billingCurrency: DEFAULT_BILLING_CURRENCY,
};

export function isBillingCurrency(value: unknown): value is BillingCurrency {
  return value === 'EUR' || value === 'USD';
}

export function normalizeUserProfilePreferences(
  value?: Partial<UserProfilePreferences> | null
): UserProfilePreferences {
  return {
    displayName: typeof value?.displayName === 'string' ? value.displayName.trim().slice(0, 60) : '',
    avatarDataUrl: typeof value?.avatarDataUrl === 'string' ? value.avatarDataUrl : '',
    billingCurrency: isBillingCurrency(value?.billingCurrency) ? value.billingCurrency : DEFAULT_BILLING_CURRENCY,
  };
}
