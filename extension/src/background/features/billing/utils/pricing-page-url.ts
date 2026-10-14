import type { AppEnvironment } from 'shared/app-environment';
import { PRICING_PAGE_URL } from 'shared/subscription-config';

export type WebsiteCheckoutEnvironment = Extract<AppEnvironment, 'staging' | 'production'>;

const HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function buildAuthenticatedPricingUrl(
  handoffToken: string,
  appEnvironment: AppEnvironment
): string {
  if (!HANDOFF_TOKEN_PATTERN.test(handoffToken)) {
    throw new Error('Billing service did not return a valid pricing handoff.');
  }
  if (appEnvironment !== 'staging' && appEnvironment !== 'production') {
    throw new Error('Authenticated pricing is available only in staging and production builds.');
  }

  const fragment = new URLSearchParams({
    handoff: handoffToken,
    checkoutEnvironment: appEnvironment,
  });
  return `${PRICING_PAGE_URL}#${fragment.toString()}`;
}
