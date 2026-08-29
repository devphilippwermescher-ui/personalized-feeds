import type { ProBillingInterval } from 'shared/subscription-config';
import { createBillingCheckoutUrl, getBillingPortalUrl } from '../services/billing-functions-client';
import type { BillingActionResponse, BillingMessage } from '../types';

function isBillingInterval(value: unknown): value is ProBillingInterval {
  return value === 'monthly' || value === 'annual';
}

function isBillingMessage(message: unknown): message is BillingMessage {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  const candidate = message as { type?: unknown; interval?: unknown };
  return (
    candidate.type === 'BILLING_OPEN_PORTAL' ||
    (candidate.type === 'BILLING_OPEN_CHECKOUT' && isBillingInterval(candidate.interval))
  );
}

async function openBillingTab(message: BillingMessage): Promise<BillingActionResponse> {
  const url =
    message.type === 'BILLING_OPEN_CHECKOUT'
      ? await createBillingCheckoutUrl(message.interval)
      : await getBillingPortalUrl();
  await chrome.tabs.create({ url });
  return { success: true };
}

export function registerBillingMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isBillingMessage(message)) return false;

    void openBillingTab(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies BillingActionResponse);
      });
    return true;
  });
}
