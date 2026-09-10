import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeScript, fetchWithTimeout, getLinkedInCsrfToken } = vi.hoisted(() => ({
  executeScript: vi.fn(),
  fetchWithTimeout: vi.fn(),
  getLinkedInCsrfToken: vi.fn(),
}));

vi.mock('../../../shared/async/fetch-with-timeout', () => ({ fetchWithTimeout }));
vi.mock('../../../platform/linkedin/csrf-token', () => ({ getLinkedInCsrfToken }));

import { fetchSocialSellingIndexSnapshot, SOCIAL_SELLING_INDEX_URL } from '../profile-analytics-ssi-api';

describe('Social Selling Index API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLinkedInCsrfToken.mockResolvedValue('ajax:test-csrf-token');
    Object.assign(globalThis, {
      chrome: {
        scripting: {
          executeScript,
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
    executeScript.mockResolvedValue([
      {
        result: {
          ok: true,
          status: 200,
          payload: {
            groupScore: [{ rank: 85, groupType: 'INDUSTRY' }],
            memberScore: { overall: 15.683752 },
          },
        },
      },
    ]);

    await expect(fetchSocialSellingIndexSnapshot(123, 42)).resolves.toMatchObject({ score: 16 });
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 42 },
        world: 'MAIN',
        args: [SOCIAL_SELLING_INDEX_URL, 'ajax:test-csrf-token'],
      })
    );
  });
});
