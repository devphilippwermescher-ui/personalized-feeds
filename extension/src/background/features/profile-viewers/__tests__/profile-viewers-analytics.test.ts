import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared/feature-flags', () => ({
  DASHBOARD_ANALYTICS_SYNC_ENABLED: true,
}));

const mocks = vi.hoisted(() => ({
  getProfileAnalyticsSnapshot: vi.fn(),
  getProfileViewerSummary: vi.fn(),
  upsertProfileAnalyticsSnapshot: vi.fn(),
}));

vi.mock('shared/firestore-service', () => mocks);

import { recordProfileViewsAnalytics } from '../profile-viewers-analytics';

describe('profile viewers analytics recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfileViewerSummary.mockResolvedValue({
      privateViewerCount: 32,
      updatedAt: 1,
    });
    mocks.upsertProfileAnalyticsSnapshot.mockResolvedValue(undefined);
  });

  it('preserves the previous visible count when the current aggregate is unavailable', async () => {
    mocks.getProfileAnalyticsSnapshot.mockResolvedValue({
      profileViews: {
        visibleCount: 25,
        privateCount: 3,
        totalCount: 28,
      },
    });

    await recordProfileViewsAnalytics({
      userId: 'user-1',
      visibleCount: undefined,
      privateCount: 32,
      updatedAt: 100,
    });

    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user-1',
      {
        profileViews: expect.objectContaining({
          visibleCount: 25,
          privateCount: 32,
          totalCount: 57,
        }),
      },
      { updatedAt: 100 }
    );
  });

  it('does not write an invented zero when no visible count is available', async () => {
    mocks.getProfileAnalyticsSnapshot.mockResolvedValue(null);

    await recordProfileViewsAnalytics({
      userId: 'user-1',
      visibleCount: undefined,
      privateCount: 32,
      updatedAt: 100,
    });

    expect(mocks.upsertProfileAnalyticsSnapshot).not.toHaveBeenCalled();
  });

  it('includes recruiter views in the persisted total', async () => {
    mocks.getProfileAnalyticsSnapshot.mockResolvedValue({
      profileViews: {
        visibleCount: 62,
        privateCount: 26,
        recruiterCount: 38,
        totalCount: 126,
      },
    });

    await recordProfileViewsAnalytics({
      userId: 'user-1',
      visibleCount: 62,
      privateCount: 26,
      recruiterCount: 39,
      updatedAt: 100,
    });

    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user-1',
      {
        profileViews: expect.objectContaining({
          visibleCount: 62,
          privateCount: 26,
          recruiterCount: 39,
          totalCount: 127,
        }),
      },
      { updatedAt: 100 }
    );
  });
});
