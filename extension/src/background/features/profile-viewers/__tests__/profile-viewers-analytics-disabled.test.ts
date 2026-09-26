import { describe, expect, it, vi } from 'vitest';

vi.mock('shared/feature-flags', () => ({
  DASHBOARD_ANALYTICS_SYNC_ENABLED: false,
}));

const mocks = vi.hoisted(() => ({
  getProfileAnalyticsSnapshot: vi.fn(),
  getProfileViewerSummary: vi.fn(),
  upsertProfileAnalyticsSnapshot: vi.fn(),
}));

vi.mock('shared/firestore-service', () => mocks);

import { recordProfileViewsAnalytics } from '../profile-viewers-analytics';

describe('profile viewers analytics while the dashboard is disabled', () => {
  it('does not read or write dashboard analytics data', async () => {
    await recordProfileViewsAnalytics({
      userId: 'user-1',
      visibleCount: 3,
      privateCount: 32,
      updatedAt: 100,
    });

    expect(mocks.getProfileAnalyticsSnapshot).not.toHaveBeenCalled();
    expect(mocks.getProfileViewerSummary).not.toHaveBeenCalled();
    expect(mocks.upsertProfileAnalyticsSnapshot).not.toHaveBeenCalled();
  });
});
