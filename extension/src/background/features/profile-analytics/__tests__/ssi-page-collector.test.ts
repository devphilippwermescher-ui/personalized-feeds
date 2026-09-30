import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectSocialSellingIndexInLinkedInPage } from '../api/ssi-page-collector';

describe('LinkedIn SSI page collector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.textContent = '';
  });

  it('falls back to Current SSI and ignores the Industry and Network ranks', async () => {
    document.body.textContent = `
      Your Social Selling Index
      Top 85% Industry SSI rank
      Top 94% Network SSI rank
      Current Social Selling Index
      16 out of 100
    `;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    await expect(
      collectSocialSellingIndexInLinkedInPage('https://www.linkedin.com/sales-api/salesApiSsi')
    ).resolves.toEqual({
      ok: true,
      payload: { memberScore: { overall: 16 } },
    });
  });

  it('prefers a valid API member score over visible rank text', async () => {
    document.body.textContent = 'Top 85% Industry SSI rank Current Social Selling Index 16 out of 100';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ memberScore: { overall: 17.4 } }),
      })
    );

    await expect(
      collectSocialSellingIndexInLinkedInPage('https://www.linkedin.com/sales-api/salesApiSsi')
    ).resolves.toEqual({
      ok: true,
      status: 200,
      payload: { memberScore: { overall: 17.4 } },
    });
  });
});
