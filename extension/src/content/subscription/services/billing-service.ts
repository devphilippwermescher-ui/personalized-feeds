import type { BillingSubscription } from 'shared/plans';
import type { ProBillingInterval } from 'shared/subscription-config';
import type { BillingCurrency } from 'shared/types';

interface BillingActionResponse {
  success?: boolean;
  error?: string;
}

export interface PlanSnapshotResponse {
  success?: boolean;
  plan?: 'free' | 'pro' | null;
  subscription?: BillingSubscription | null;
  error?: string;
}

async function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

function assertBillingAction(response: BillingActionResponse): void {
  if (!response?.success) {
    throw new Error(response?.error || 'Billing action failed.');
  }
}

export async function openCheckout(interval: ProBillingInterval, currency: BillingCurrency): Promise<void> {
  const response = await sendMessage<BillingActionResponse>({
    type: 'BILLING_OPEN_CHECKOUT',
    interval,
    currency,
  });
  assertBillingAction(response);
}

export async function openCustomerPortal(): Promise<void> {
  const response = await sendMessage<BillingActionResponse>({ type: 'BILLING_OPEN_PORTAL' });
  assertBillingAction(response);
}

export async function getPlanSnapshot(force = false): Promise<PlanSnapshotResponse> {
  return sendMessage<PlanSnapshotResponse>({ type: 'PLAN_GET', force });
}
