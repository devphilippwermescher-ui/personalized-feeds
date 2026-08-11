import { describe, expect, it } from 'vitest';
import {
  createProfileAnalyticsSyncState,
  canRunProfileAnalyticsNetworkSync,
  getProfileAnalyticsScheduledIntervalMs,
  isConnectionHistoryDue,
  isCurrentProfileAnalyticsDue,
  isCurrentProfileAnalyticsRetryBlocked,
  isDashboardNetworkSyncDue,
  isSearchAppearancesDue,
  isSocialSellingIndexDue,
  PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS,
  PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS,
  PROFILE_ANALYTICS_MAX_NETWORK_CYCLES_PER_WINDOW,
  recordProfileAnalyticsNetworkSync,
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

  it('uses a 55-to-65 minute jitter for the next background check', () => {
    expect(getProfileAnalyticsScheduledIntervalMs(0)).toBe(55 * 60 * 1000);
    expect(getProfileAnalyticsScheduledIntervalMs(0.5)).toBe(60 * 60 * 1000);
    expect(getProfileAnalyticsScheduledIntervalMs(1)).toBe(65 * 60 * 1000);
  });

  it('caps foreground and alarm network cycles in a shared 24-hour budget', () => {
    let state = createProfileAnalyticsSyncState('user');
    for (let index = 0; index < PROFILE_ANALYTICS_MAX_NETWORK_CYCLES_PER_WINDOW; index += 1) {
      expect(canRunProfileAnalyticsNetworkSync(state, now)).toBe(true);
      state = recordProfileAnalyticsNetworkSync(state, now);
    }
    expect(canRunProfileAnalyticsNetworkSync(state, now)).toBe(false);
    expect(canRunProfileAnalyticsNetworkSync(state, now + 24 * 60 * 60 * 1000)).toBe(true);
  });

  it('forces a dashboard refresh except inside the two-minute dedupe window', () => {
    const state = createProfileAnalyticsSyncState('user');
    state.networkLastSuccessAt = now - 60_000;
    expect(isDashboardNetworkSyncDue(now, state)).toBe(false);
    state.networkLastSuccessAt = now - 2 * 60 * 1000;
    expect(isDashboardNetworkSyncDue(now, state)).toBe(true);
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
