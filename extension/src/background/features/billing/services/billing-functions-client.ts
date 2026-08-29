import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { FIREBASE_EMULATOR_HOST, FIREBASE_EMULATOR_PORTS, shouldUseFirebaseEmulators } from 'shared/app-environment';
import { getFirebaseApp } from 'shared/firebase-config';
import { BILLING_FUNCTION_NAMES, BILLING_FUNCTION_REGION, type ProBillingInterval } from 'shared/subscription-config';
import { waitForAuthReady } from '../../../../services/auth';

interface BillingUrlResponse {
  url: string;
}

let billingFunctions: Functions | null = null;

function getBillingFunctions(): Functions {
  if (billingFunctions) return billingFunctions;

  billingFunctions = getFunctions(getFirebaseApp(), BILLING_FUNCTION_REGION);
  if (shouldUseFirebaseEmulators()) {
    connectFunctionsEmulator(billingFunctions, FIREBASE_EMULATOR_HOST, FIREBASE_EMULATOR_PORTS.functions);
  }
  return billingFunctions;
}

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

export async function createBillingCheckoutUrl(interval: ProBillingInterval): Promise<string> {
  await requireAuthenticatedUser();
  const createCheckout = httpsCallable<{ interval: ProBillingInterval }, BillingUrlResponse>(
    getBillingFunctions(),
    BILLING_FUNCTION_NAMES.createCheckout
  );
  const result = await createCheckout({ interval });
  return assertHttpsUrl(result.data.url);
}

export async function getBillingPortalUrl(): Promise<string> {
  await requireAuthenticatedUser();
  const getPortal = httpsCallable<Record<string, never>, BillingUrlResponse>(
    getBillingFunctions(),
    BILLING_FUNCTION_NAMES.getPortal
  );
  const result = await getPortal({});
  return assertHttpsUrl(result.data.url);
}
