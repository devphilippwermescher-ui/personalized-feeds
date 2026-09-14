import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectFollowersInLinkedInPage } from '../api/followers-page-collector';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LinkedIn followers page collector', () => {
  it('reads the exact account total from the followers search metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          data: {
            searchDashClustersByAll: {
              metadata: { totalResultCount: 81 },
              paging: { start: 0, count: 10, total: 81 },
            },
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectFollowersInLinkedInPage('csrf-token', 'https://www.linkedin.com/test')).resolves.toMatchObject({
      followersCount: 81,
      httpStatus: 200,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.linkedin.com/test',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-li-page-instance': expect.stringContaining('d_flagship3_curation_hub_pf_followers'),
          'x-li-track': expect.any(String),
        }),
      })
    );
  });

  it('reports a missing result total instead of falling back to a profile count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { data: { searchDashClustersByAll: { metadata: {} } } } }),
      })
    );

    const result = await collectFollowersInLinkedInPage('csrf-token', 'https://www.linkedin.com/test');
    expect(result.followersCount).toBeUndefined();
    expect(result.error).toContain('result total');
  });
});
