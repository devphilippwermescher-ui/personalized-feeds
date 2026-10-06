import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPricingPage } from '../services/pricing-page';

describe('pricing page navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks the background service to open pricing with an authenticated handoff', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    await expect(openPricingPage()).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'BILLING_OPEN_PRICING' });
  });

  it('surfaces a failed background action', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ success: false, error: 'Pricing is unavailable' });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    await expect(openPricingPage()).rejects.toThrow('Pricing is unavailable');
  });
});
