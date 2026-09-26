import { httpsCallable } from 'firebase/functions';
import {
  BILLING_FUNCTION_NAMES,
  BILLING_FUNCTION_REGION,
  PRICING_PAGE_URL,
  type ProBillingInterval,
} from 'shared/subscription-config';
import type { BillingCurrency } from 'shared/types';
import { waitForAuthReady } from '../../../../services/auth';
import { getCallableFunctions } from '../../../platform/firebase/callable-functions';

interface BillingUrlResponse {
  url: string;
}

interface BillingHandoffResponse {
  token: string;
  expiresAt: number;
}

interface BillingClaimResponse {
  claimedCount: number;
  verificationRequired: boolean;
}

const HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

let pendingGuestClaim: Promise<BillingClaimResponse> | null = null;
let lastGuestClaim: { result: BillingClaimResponse; checkedAt: number } | null = null;
const GUEST_CLAIM_DEDUPE_MS = 5_000;

function assertHttpsUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Billing service did not return a URL');
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Billing service returned an unsafe URL');
  return url.toString();
}

async function requireAuthenticatedUser(): Promise<void> {
  const user = await waitForAuthReady();
  if (!user) throw new Error('Sign in to manage your plan.');
}

export async function createBillingCheckoutUrl(
  interval: ProBillingInterval,
  currency: BillingCurrency
): Promise<string> {
  await requireAuthenticatedUser();
  const createCheckout = httpsCallable<{ interval: ProBillingInterval; currency: BillingCurrency }, BillingUrlResponse>(
    getCallableFunctions(BILLING_FUNCTION_REGION),
    BILLING_FUNCTION_NAMES.createCheckout
  );
  const result = await createCheckout({ interval, currency });
  return assertHttpsUrl(result.data.url);
}

export async function getBillingPortalUrl(): Promise<string> {
  await requireAuthenticatedUser();
  const getPortal = httpsCallable<Record<string, never>, BillingUrlResponse>(
    getCallableFunctions(BILLING_FUNCTION_REGION),
    BILLING_FUNCTION_NAMES.getPortal
  );
  const result = await getPortal({});
  return assertHttpsUrl(result.data.url);
}

export async function createBillingPricingUrl(): Promise<string> {
  await requireAuthenticatedUser();
  const createHandoff = httpsCallable<Record<string, never>, BillingHandoffResponse>(
    getCallableFunctions(BILLING_FUNCTION_REGION),
    BILLING_FUNCTION_NAMES.createHandoff
  );
  const result = await createHandoff({});
  if (!HANDOFF_TOKEN_PATTERN.test(result.data.token) || !Number.isFinite(result.data.expiresAt)) {
    throw new Error('Billing service did not return a valid pricing handoff.');
  }
  return `${PRICING_PAGE_URL}#handoff=${result.data.token}`;
}

export async function claimGuestBillingSubscription(): Promise<BillingClaimResponse> {
  if (pendingGuestClaim) return pendingGuestClaim;
  if (lastGuestClaim && Date.now() - lastGuestClaim.checkedAt < GUEST_CLAIM_DEDUPE_MS) {
    return lastGuestClaim.result;
  }
  pendingGuestClaim = (async () => {
    const user = await waitForAuthReady();
    if (!user) throw new Error('Sign in to claim your subscription.');
    await user.getIdToken(true);
    const claimSubscription = httpsCallable<Record<string, never>, BillingClaimResponse>(
      getCallableFunctions(BILLING_FUNCTION_REGION),
      BILLING_FUNCTION_NAMES.claimGuestSubscription
    );
    const result = await claimSubscription({});
    const normalized = {
      claimedCount: Number.isSafeInteger(result.data.claimedCount) ? result.data.claimedCount : 0,
      verificationRequired: result.data.verificationRequired === true,
    };
    lastGuestClaim = { result: normalized, checkedAt: Date.now() };
    return normalized;
  })();
  try {
    return await pendingGuestClaim;
  } finally {
    pendingGuestClaim = null;
  }
}
