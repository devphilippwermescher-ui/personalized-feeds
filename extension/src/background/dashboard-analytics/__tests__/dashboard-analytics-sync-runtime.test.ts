import { describe, expect, it } from 'vitest';
import { createProfileAnalyticsSyncState } from '../../profile-analytics-sync-policy';
import { migrateToDashboardAnalyticsSyncState } from '../dashboard-analytics-sync-policy';
import { getNextDashboardAnalyticsAlarmAt } from '../dashboard-analytics-sync-runtime';

describe('Dashboard Analytics sync runtime while Content Analytics is disabled', () => {
  it('ignores an overdue Content range when planning the shared alarm', () => {
    const now = 1_800_000_000_000;
    const state = migrateToDashboardAnalyticsSyncState(createProfileAnalyticsSyncState('user-1'));
    state.networkNextDueAt = now + 60_000;
    state.searchLastSuccessAt = now;
    state.ssiLastSuccessAt = now;
    state.content = {
      version: 1,
      nextDueAt: now + 120_000,
      ranges: {
        '1y': { lastSuccessAt: now - 86_400_000, nextDueAt: now - 1 },
      },
      postEnrichment: { enrichedAt: {} },
    };

    expect(getNextDashboardAnalyticsAlarmAt(state, now)).toBe(now + 60_000);
  });
});
