export { PRICING_PAGE_URL } from 'shared/subscription-config';

export function openPricingPage(): void {
  void chrome.runtime.sendMessage({ type: 'BILLING_OPEN_PRICING' });
}
