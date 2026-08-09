import { describe, expect, it } from 'vitest';
import {
  isConnectionHistoryDue,
  isCurrentProfileAnalyticsDue,
  PROFILE_ANALYTICS_SYNC_INTERVAL_MS,
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
