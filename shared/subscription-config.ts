import { getAppEnvironment, type AppEnvironment } from './app-environment';

/**
 * Lemon Squeezy checkout URLs are intentionally centralized here. The billing
 * webhook remains authoritative for activating Pro; opening checkout never
 * changes the local plan by itself.
 */
export const LEMON_SQUEEZY_CHECKOUT_URLS: Record<AppEnvironment, string> = {
  development: '',
  staging: '',
  production: '',
};

export function getLemonSqueezyCheckoutUrl(): string | null {
  const url = LEMON_SQUEEZY_CHECKOUT_URLS[getAppEnvironment()]?.trim();
  return url || null;
}
