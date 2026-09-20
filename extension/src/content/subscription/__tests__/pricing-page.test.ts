import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPricingPage, PRICING_PAGE_URL } from '../services/pricing-page';

describe('pricing page navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the public pricing page in a safe new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openPricingPage();

    expect(open).toHaveBeenCalledWith(PRICING_PAGE_URL, '_blank', 'noopener,noreferrer');
  });
});
