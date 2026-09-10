import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProfileAnalyticsSyncState } from '../../profile-analytics/profile-analytics-sync-policy';
import { migrateToDashboardAnalyticsSyncState } from '../dashboard-analytics-sync-policy';
import {
  clearDashboardAnalyticsAlarm,
  getNextDashboardAnalyticsAlarmAt,
  scheduleDashboardAnalyticsAlarm,
} from '../dashboard-analytics-sync-runtime';

describe('Dashboard Analytics sync runtime while Content Analytics is disabled', () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it('clears the shared analytics alarm left by a dashboard-enabled build', async () => {
    const clear = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('chrome', { alarms: { clear } });

    await expect(clearDashboardAnalyticsAlarm()).resolves.toBe(true);
    expect(clear).toHaveBeenCalledWith('profile-analytics-sync-v1');
  });

  it('refuses to schedule a new analytics alarm in a dashboard-disabled release', async () => {
    const clear = vi.fn().mockResolvedValue(true);
    const create = vi.fn();
    vi.stubGlobal('chrome', { alarms: { clear, create } });

    await expect(scheduleDashboardAnalyticsAlarm(Date.now() + 60_000, 'test')).resolves.toBeUndefined();
    expect(clear).toHaveBeenCalledWith('profile-analytics-sync-v1');
    expect(create).not.toHaveBeenCalled();
  });
});
