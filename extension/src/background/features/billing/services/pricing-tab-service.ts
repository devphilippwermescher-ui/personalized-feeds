import { PRICING_PAGE_URL } from 'shared/subscription-config';
import { createBillingPricingUrl } from './billing-functions-client';

const PRICING_LOADING_PAGE = 'pricing-loading.html';

export interface PricingTabDependencies {
  getLoadingPageUrl(): string;
  createTab(url: string): Promise<{ id?: number }>;
  createPricingUrl(): Promise<string>;
  updateTab(tabId: number, url: string): Promise<void>;
  warn(message: string, error: unknown): void;
}

function getDefaultDependencies(): PricingTabDependencies {
  return {
    getLoadingPageUrl: () => chrome.runtime.getURL(PRICING_LOADING_PAGE),
    createTab: (url) => chrome.tabs.create({ url }),
    createPricingUrl: () => createBillingPricingUrl(),
    updateTab: async (tabId, url) => {
      await chrome.tabs.update(tabId, { url });
    },
    warn: (message, error) => console.warn(message, error),
  };
}

export async function openPricingTabWithHandoff(
  dependencies: PricingTabDependencies = getDefaultDependencies()
): Promise<void> {
  const loadingPageUrl = dependencies.getLoadingPageUrl();
  const tabPromise = dependencies.createTab(loadingPageUrl);
  const pricingUrlPromise = dependencies.createPricingUrl().catch((error) => {
    dependencies.warn('[billing] Authenticated pricing handoff was unavailable; opening guest pricing.', error);
    return PRICING_PAGE_URL;
  });

  const [tab, pricingUrl] = await Promise.all([tabPromise, pricingUrlPromise]);
  if (typeof tab.id !== 'number') {
    throw new Error('Chrome did not return an ID for the pricing tab.');
  }
  await dependencies.updateTab(tab.id, pricingUrl);
}
