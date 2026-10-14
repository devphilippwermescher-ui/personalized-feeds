import { describe, expect, it, vi } from 'vitest';
import { PRICING_PAGE_URL } from 'shared/subscription-config';

vi.mock('../services/billing-functions-client', () => ({
  createBillingPricingUrl: vi.fn(),
}));

import {
  openPricingTabWithHandoff,
  type PricingTabDependencies,
} from '../services/pricing-tab-service';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createDependencies(overrides: Partial<PricingTabDependencies> = {}): PricingTabDependencies {
  return {
    getLoadingPageUrl: vi.fn(() => 'chrome-extension://extension-id/pricing-loading.html'),
    createTab: vi.fn(async () => ({ id: 42 })),
    createPricingUrl: vi.fn(async () => 'https://myfeedpilot.com/pricing#handoff=token'),
    updateTab: vi.fn(async () => undefined),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('pricing tab handoff', () => {
  it('opens the loading tab immediately while the authenticated pricing URL is pending', async () => {
    const pricingUrl = createDeferred<string>();
    const callOrder: string[] = [];
    const dependencies = createDependencies({
      createTab: vi.fn(async (url) => {
        callOrder.push(`create:${url}`);
        return { id: 42 };
      }),
      createPricingUrl: vi.fn(() => {
        callOrder.push('handoff');
        return pricingUrl.promise;
      }),
      updateTab: vi.fn(async (tabId, url) => {
        callOrder.push(`update:${tabId}:${url}`);
      }),
    });

    const opening = openPricingTabWithHandoff(dependencies);

    expect(callOrder).toEqual([
      'create:chrome-extension://extension-id/pricing-loading.html',
      'handoff',
    ]);
    expect(dependencies.updateTab).not.toHaveBeenCalled();

    pricingUrl.resolve('https://myfeedpilot.com/pricing#handoff=token');
    await opening;

    expect(callOrder).toEqual([
      'create:chrome-extension://extension-id/pricing-loading.html',
      'handoff',
      'update:42:https://myfeedpilot.com/pricing#handoff=token',
    ]);
  });

  it('updates the same tab to guest pricing when authenticated handoff creation fails', async () => {
    const handoffError = new Error('cold start timeout');
    const dependencies = createDependencies({
      createPricingUrl: vi.fn().mockRejectedValue(handoffError),
    });

    await openPricingTabWithHandoff(dependencies);

    expect(dependencies.updateTab).toHaveBeenCalledWith(42, PRICING_PAGE_URL);
    expect(dependencies.warn).toHaveBeenCalledWith(
      '[billing] Authenticated pricing handoff was unavailable; opening guest pricing.',
      handoffError
    );
  });

  it('fails safely when Chrome does not return a tab ID', async () => {
    const dependencies = createDependencies({ createTab: vi.fn(async () => ({})) });

    await expect(openPricingTabWithHandoff(dependencies)).rejects.toThrow(
      'Chrome did not return an ID for the pricing tab.'
    );
    expect(dependencies.updateTab).not.toHaveBeenCalled();
  });
});
