export const PRICING_PAGE_URL = 'https://myfeedpilot.com/pricing';

export function openPricingPage(): void {
  window.open(PRICING_PAGE_URL, '_blank', 'noopener,noreferrer');
}
