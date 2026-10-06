export { PRICING_PAGE_URL } from 'shared/subscription-config';

interface BillingActionResponse {
  success?: boolean;
  error?: string;
}

export async function openPricingPage(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'BILLING_OPEN_PRICING' })) as BillingActionResponse;
  if (!response?.success) {
    throw new Error(response?.error || 'Unable to open pricing right now.');
  }
}
