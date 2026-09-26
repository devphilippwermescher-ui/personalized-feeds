import { PRICING_PAGE_URL, type ProBillingInterval } from 'shared/subscription-config';
import { isBillingCurrency } from 'shared/user-profile-preferences';
import {
  createBillingCheckoutUrl,
  createBillingPricingUrl,
  getBillingPortalUrl,
} from '../services/billing-functions-client';
import {
  dismissCurrentBillingNotice,
  startPlanSubscriptionRuntime,
} from '../services/plan-subscription-runtime';
import type { BillingActionResponse, BillingMessage } from '../types';

type BillingOpenMessage = Exclude<BillingMessage, { type: 'BILLING_NOTICE_GET' | 'BILLING_NOTICE_DISMISS' }>;

function isBillingInterval(value: unknown): value is ProBillingInterval {
  return value === 'monthly' || value === 'annual';
}

function isBillingMessage(message: unknown): message is BillingMessage {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  const candidate = message as { type?: unknown; interval?: unknown; currency?: unknown; noticeId?: unknown };
  return (
    candidate.type === 'BILLING_OPEN_PRICING' ||
    candidate.type === 'BILLING_OPEN_PORTAL' ||
    candidate.type === 'BILLING_NOTICE_GET' ||
    (candidate.type === 'BILLING_NOTICE_DISMISS' &&
      typeof candidate.noticeId === 'string' &&
      candidate.noticeId.length <= 256) ||
    (candidate.type === 'BILLING_OPEN_CHECKOUT' &&
      isBillingInterval(candidate.interval) &&
      isBillingCurrency(candidate.currency))
  );
}

async function openBillingTab(message: BillingOpenMessage): Promise<BillingActionResponse> {
  let url: string;
  if (message.type === 'BILLING_OPEN_CHECKOUT') {
    url = await createBillingCheckoutUrl(message.interval, message.currency);
  } else if (message.type === 'BILLING_OPEN_PRICING') {
    try {
      url = await createBillingPricingUrl();
    } catch (error) {
      console.warn('[billing] Authenticated pricing handoff was unavailable; opening guest pricing.', error);
      url = PRICING_PAGE_URL;
    }
  } else {
    url = await getBillingPortalUrl();
  }
  await chrome.tabs.create({ url });
  return { success: true };
}

export function registerBillingMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isBillingMessage(message)) return false;

    const action =
      message.type === 'BILLING_NOTICE_GET'
        ? startPlanSubscriptionRuntime().then((notice) => ({ success: true, notice }))
        : message.type === 'BILLING_NOTICE_DISMISS'
          ? dismissCurrentBillingNotice(message.noticeId).then(() => ({ success: true }))
          : openBillingTab(message);

    void action
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
