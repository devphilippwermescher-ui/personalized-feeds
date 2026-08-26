import { describe, expect, it } from 'vitest';
import {
  createProfileAnalyticsSyncState,
  canRunProfileAnalyticsNetworkSync,
  getProfileAnalyticsNetworkBudget,
  getProfileAnalyticsScheduledIntervalMs,
  isConnectionHistoryDue,
  isCurrentProfileAnalyticsDue,
  isCurrentProfileAnalyticsRetryBlocked,
  isDashboardNetworkSyncDue,
  isSearchAppearancesDue,
  isSocialSellingIndexDue,
  PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS,
  PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS,
  PROFILE_ANALYTICS_NETWORK_BACKGROUND_RESERVE,
  PROFILE_ANALYTICS_NETWORK_BUDGET_CAPACITY,
  PROFILE_ANALYTICS_NETWORK_BUDGET_REFILL_MS,
  recordProfileAnalyticsNetworkSync,
  markProfileAnalyticsNetworkDirty,
  selectPendingProfileAnalyticsRequest,
} from '../profile-analytics-sync-policy';

describe('profile analytics sync policy', () => {
  const now = Date.UTC(2026, 7, 9, 12);

  it('runs volatile network metrics hourly', () => {
    const state = createProfileAnalyticsSyncState('user');
    state.networkLastSuccessAt = now - PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS + 1;
    expect(isCurrentProfileAnalyticsDue({ now, state })).toBe(false);
    state.networkLastSuccessAt = now - PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS;
    expect(isCurrentProfileAnalyticsDue({ now, state })).toBe(true);
  });

  it('uses a 60-to-65 minute jitter for the next background check', () => {
    expect(getProfileAnalyticsScheduledIntervalMs(0)).toBe(60 * 60 * 1000);
    expect(getProfileAnalyticsScheduledIntervalMs(0.5)).toBe(62.5 * 60 * 1000);
    expect(getProfileAnalyticsScheduledIntervalMs(1)).toBe(65 * 60 * 1000);
  });

  it('gradually refills the shared Connections and Followers network budget', () => {
    let state = createProfileAnalyticsSyncState('user');
    state.networkBudgetUpdatedAt = now;
    for (let index = 0; index < PROFILE_ANALYTICS_NETWORK_BUDGET_CAPACITY; index += 1) {
      expect(canRunProfileAnalyticsNetworkSync(state, now)).toBe(true);
      state = recordProfileAnalyticsNetworkSync(state, now);
    }
    expect(canRunProfileAnalyticsNetworkSync(state, now)).toBe(false);
    expect(canRunProfileAnalyticsNetworkSync(state, now + PROFILE_ANALYTICS_NETWORK_BUDGET_REFILL_MS - 1)).toBe(false);
    expect(canRunProfileAnalyticsNetworkSync(state, now + PROFILE_ANALYTICS_NETWORK_BUDGET_REFILL_MS)).toBe(true);
    expect(getProfileAnalyticsNetworkBudget(state, now + PROFILE_ANALYTICS_NETWORK_BUDGET_REFILL_MS)).toEqual(
      expect.objectContaining({ tokensAvailable: 1 })
    );
  });

  it('reserves the final network tokens for alarms instead of dashboard reloads', () => {
    const state = createProfileAnalyticsSyncState('user');
    state.networkBudgetTokens = PROFILE_ANALYTICS_NETWORK_BACKGROUND_RESERVE;
    state.networkBudgetUpdatedAt = now;
    expect(canRunProfileAnalyticsNetworkSync(state, now, 'dashboard_open')).toBe(false);
    expect(canRunProfileAnalyticsNetworkSync(state, now, 'alarm')).toBe(true);
  });

  it('forces a dashboard refresh except inside the five-minute freshness window', () => {
    const state = createProfileAnalyticsSyncState('user');
    state.networkLastSuccessAt = now - 4 * 60_000;
    expect(isDashboardNetworkSyncDue(now, state)).toBe(false);
    state.networkLastSuccessAt = now - 5 * 60 * 1000;
    expect(isDashboardNetworkSyncDue(now, state)).toBe(true);
  });

  it('refreshes a dirty network total even inside the dashboard freshness window', () => {
    let state = createProfileAnalyticsSyncState('user');
    state.networkLastSuccessAt = now - 60_000;
    state = markProfileAnalyticsNetworkDirty(state, now);
    expect(isDashboardNetworkSyncDue(now, state)).toBe(true);
    expect(isCurrentProfileAnalyticsDue({ now, state })).toBe(true);
  });

  it('collects SSI and Search Appearances only once per 24 hours', () => {
    const state = createProfileAnalyticsSyncState('user');
    state.ssiLastSuccessAt = now - PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS + 1;
    state.searchLastSuccessAt = now - PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS + 1;
    expect(isSocialSellingIndexDue({ now, state })).toBe(false);
    expect(isSearchAppearancesDue({ now, state })).toBe(false);
    state.ssiLastSuccessAt = now - PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS;
    state.searchLastSuccessAt = now - PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS;
    expect(isSocialSellingIndexDue({ now, state })).toBe(true);
    expect(isSearchAppearancesDue({ now, state })).toBe(true);
  });

  it('never lets a dashboard-open trigger bypass a restriction cooldown', () => {
    const state = createProfileAnalyticsSyncState('user');
    state.networkNextRetryAt = now + 60_000;
    state.networkRetryKind = 'restriction';
    expect(isCurrentProfileAnalyticsRetryBlocked({ now, state, trigger: 'dashboard_open' })).toBe(true);
    expect(isCurrentProfileAnalyticsRetryBlocked({ now, state, trigger: 'manual' })).toBe(true);
  });

  it('lets a newly opened LinkedIn document retry an ordinary tab failure immediately', () => {
    const state = createProfileAnalyticsSyncState('user');
    state.networkNextRetryAt = now + 60_000;
    state.networkRetryKind = 'standard';
    expect(isCurrentProfileAnalyticsRetryBlocked({ now, state, trigger: 'dashboard_open' })).toBe(true);
    expect(isCurrentProfileAnalyticsRetryBlocked({ now, state, trigger: 'linkedin_open' })).toBe(false);
  });

  it('keeps a dashboard-open follow-up while a worker evaluation is active', () => {
    expect(
      selectPendingProfileAnalyticsRequest({ trigger: 'service_worker' }, null, { trigger: 'dashboard_open' })
    ).toEqual({ trigger: 'dashboard_open' });
  });

  it('keeps a LinkedIn-open follow-up so a new document can bypass a standard retry', () => {
    expect(
      selectPendingProfileAnalyticsRequest({ trigger: 'service_worker' }, null, {
        trigger: 'linkedin_open',
        preferredTabId: 42,
      })
    ).toEqual({ trigger: 'linkedin_open', preferredTabId: 42 });
  });

  it('never drops a profile metadata change behind a routine active evaluation', () => {
    expect(
      selectPendingProfileAnalyticsRequest({ trigger: 'linkedin_activity' }, null, {
        trigger: 'profile_metadata_changed',
        preferredTabId: 42,
      })
    ).toEqual({ trigger: 'profile_metadata_changed', preferredTabId: 42 });
  });

  it('does not queue routine activity as a duplicate follow-up', () => {
    expect(
      selectPendingProfileAnalyticsRequest({ trigger: 'service_worker' }, null, {
        trigger: 'linkedin_activity',
        preferredTabId: 42,
      })
    ).toBeNull();
  });

  it('retries only missing connection history and never rebuilds completed history', () => {
    expect(isConnectionHistoryDue({ now, historyComplete: true })).toBe(false);
    expect(isConnectionHistoryDue({ now, historyComplete: false })).toBe(true);
    const state = createProfileAnalyticsSyncState('user');
    state.historyNextRetryAt = now + 1;
    expect(isConnectionHistoryDue({ now, historyComplete: false, state })).toBe(false);
  });
});
