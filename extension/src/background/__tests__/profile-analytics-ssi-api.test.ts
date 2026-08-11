import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithTimeout, getLinkedInCsrfToken } = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getLinkedInCsrfToken: vi.fn(),
}));

vi.mock('../fetch-with-timeout', () => ({ fetchWithTimeout }));
vi.mock('../profile-viewers-api-client', () => ({ getLinkedInCsrfToken }));

import { fetchSocialSellingIndexSnapshot, SOCIAL_SELLING_INDEX_URL } from '../profile-analytics-ssi-api';

describe('Social Selling Index API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLinkedInCsrfToken.mockResolvedValue('ajax:test-csrf-token');
    Object.assign(globalThis, {
      chrome: {
        tabs: {
          sendMessage: vi.fn(),
        },
      },
    });
  });

  it('collects SSI directly from the extension without requiring any LinkedIn page', async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        groupScore: [{ rank: 85, groupType: 'INDUSTRY' }],
        memberScore: { overall: 15.683752 },
      }),
    });

    await expect(fetchSocialSellingIndexSnapshot(123)).resolves.toEqual({
      score: 16,
      updatedAt: 123,
      sourceUrl: SOCIAL_SELLING_INDEX_URL,
    });
    expect(fetchWithTimeout).toHaveBeenCalledOnce();
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      SOCIAL_SELLING_INDEX_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ 'csrf-token': 'ajax:test-csrf-token' }),
      }),
      expect.any(Number)
    );
  });

  it('uses an existing LinkedIn tab bridge when the extension-origin request is forbidden', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: false, status: 403 });
    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
      ok: true,
      status: 200,
      payload: {
        groupScore: [{ rank: 85, groupType: 'INDUSTRY' }],
        memberScore: { overall: 15.683752 },
      },
    });

    await expect(fetchSocialSellingIndexSnapshot(123, 42)).resolves.toMatchObject({ score: 16 });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { type: 'PROFILE_ANALYTICS_FETCH_SSI' });
  });
});
