import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchSocialSellingIndexSnapshot, upsertProfileAnalyticsSnapshot } = vi.hoisted(() => ({
  fetchSocialSellingIndexSnapshot: vi.fn(),
  upsertProfileAnalyticsSnapshot: vi.fn(),
}));

vi.mock('../profile-analytics-ssi-api', () => ({ fetchSocialSellingIndexSnapshot }));
vi.mock('shared/firestore-service', () => ({ upsertProfileAnalyticsSnapshot }));

import { syncSocialSellingIndexMetric } from '../profile-analytics-ssi-sync';

describe('Social Selling Index synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, {
      chrome: {
        storage: {
          local: {
            set: vi.fn().mockResolvedValue(undefined),
          },
        },
      },
    });
  });

  it('replaces a legacy Industry rank with the current member SSI', async () => {
    const collectedAt = Date.UTC(2026, 7, 9, 12);
    const socialSellingIndex = {
      score: 16,
      updatedAt: collectedAt,
      sourceUrl: 'https://www.linkedin.com/sales-api/salesApiSsi',
    };
    fetchSocialSellingIndexSnapshot.mockResolvedValue(socialSellingIndex);
    upsertProfileAnalyticsSnapshot.mockResolvedValue({ socialSellingIndex, updatedAt: collectedAt });

    const result = await syncSocialSellingIndexMetric({
      userId: 'user',
      trigger: 'linkedin_open',
      currentSnapshot: {
        socialSellingIndex: {
          score: 85,
          updatedAt: collectedAt - 1,
          sourceUrl: 'https://www.linkedin.com/sales/ssi',
        },
        updatedAt: collectedAt - 1,
      },
      collectedAt,
    });

    expect(upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user',
      { socialSellingIndex },
      { updatedAt: collectedAt }
    );
    expect(result).toMatchObject({ collected: true, changed: true });
    expect(result.snapshot?.socialSellingIndex?.score).toBe(16);
  });
});
