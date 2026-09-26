import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPricingPage } from '../services/pricing-page';

describe('pricing page navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks the background service to open pricing with an authenticated handoff', () => {
    const sendMessage = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    openPricingPage();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'BILLING_OPEN_PRICING' });
  });
});
