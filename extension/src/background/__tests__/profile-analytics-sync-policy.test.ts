import { describe, expect, it } from 'vitest';
import {
  isCurrentProfileAnalyticsRetryBlocked,
  isConnectionHistoryDue,
  isCurrentProfileAnalyticsDue,
  isSocialSellingIndexDue,
  isSocialSellingIndexRetryBlocked,
  PROFILE_ANALYTICS_SYNC_INTERVAL_MS,
  selectPendingProfileAnalyticsRequest,
} from '../profile-analytics-sync-policy';

describe('profile analytics sync policy', () => {
  const now = Date.UTC(2026, 7, 9, 12);

  it('does not repeat current analytics inside the six-hour interval', () => {
    expect(
      isCurrentProfileAnalyticsDue({
        now,
        state: { userId: 'user', lastSuccessAt: now - PROFILE_ANALYTICS_SYNC_INTERVAL_MS + 1 },
      })
    ).toBe(false);
    expect(
      isCurrentProfileAnalyticsDue({
        now,
        state: { userId: 'user', lastSuccessAt: now - PROFILE_ANALYTICS_SYNC_INTERVAL_MS },
      })
    ).toBe(true);
  });

  it('runs once for a newly installed sync policy even when Firestore looks fresh', () => {
    expect(
      isCurrentProfileAnalyticsDue({
        now,
      })
    ).toBe(true);
  });

  it('retries SSI independently when the main profile snapshot is still fresh', () => {
    const state = {
      userId: 'user',
      lastSuccessAt: now,
      ssiLastSuccessAt: undefined,
    };
    expect(isCurrentProfileAnalyticsDue({ now, state })).toBe(false);
    expect(isSocialSellingIndexDue({ now, state })).toBe(true);
  });

  it('lets a new LinkedIn session repair SSI after an ordinary failed request', () => {
    const state = {
      userId: 'user',
      ssiNextRetryAt: now + 60_000,
      ssiRetryKind: 'standard' as const,
    };
    expect(isSocialSellingIndexRetryBlocked({ now, state, trigger: 'linkedin_open' })).toBe(false);
    expect(isSocialSellingIndexRetryBlocked({ now, state, trigger: 'linkedin_activity' })).toBe(true);
  });

  it('lets forced user-session triggers bypass an ordinary retry cooldown', () => {
    const state = { userId: 'user', nextRetryAt: now + 60_000, retryKind: 'standard' as const };
    expect(isCurrentProfileAnalyticsRetryBlocked({ now, state, trigger: 'linkedin_open' })).toBe(false);
    expect(isCurrentProfileAnalyticsRetryBlocked({ now, state, trigger: 'linkedin_activity' })).toBe(true);
  });

  it('never bypasses a LinkedIn restriction cooldown', () => {
    const state = { userId: 'user', nextRetryAt: now + 60_000, retryKind: 'restriction' as const };
    expect(isCurrentProfileAnalyticsRetryBlocked({ now, state, trigger: 'linkedin_open' })).toBe(true);
    expect(isCurrentProfileAnalyticsRetryBlocked({ now, state, trigger: 'update' })).toBe(true);
  });

  it('keeps a forced LinkedIn-open follow-up when the worker sync is already active', () => {
    expect(
      selectPendingProfileAnalyticsRequest(
        { trigger: 'service_worker' },
        null,
        { trigger: 'linkedin_open', preferredTabId: 42 }
      )
    ).toEqual({ trigger: 'linkedin_open', preferredTabId: 42 });
  });

  it('does not queue routine activity as a duplicate follow-up', () => {
    expect(
      selectPendingProfileAnalyticsRequest(
        { trigger: 'service_worker' },
        null,
        { trigger: 'linkedin_activity', preferredTabId: 42 }
      )
    ).toBeNull();
  });

  it('retries only missing connection history and never rebuilds completed history', () => {
    expect(isConnectionHistoryDue({ now, historyComplete: true })).toBe(false);
    expect(isConnectionHistoryDue({ now, historyComplete: false })).toBe(true);
    expect(
      isConnectionHistoryDue({
        now,
        historyComplete: false,
        state: { userId: 'user', historyNextRetryAt: now + 1 },
      })
    ).toBe(false);
  });
});
