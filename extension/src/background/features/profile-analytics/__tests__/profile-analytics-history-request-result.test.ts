import { describe, expect, it } from 'vitest';
import { getProfileAnalyticsHistoryRequestResult } from '../profile-analytics-history-request-result';

describe('profile analytics history request result', () => {
  it.each(['scheduled', 'running', 'complete'] as const)(
    'reports a successfully accepted history request while status is %s',
    (historyStatus) => {
      expect(
        getProfileAnalyticsHistoryRequestResult({
          trigger: 'history_resume',
          hasLinkedInTab: true,
          historyStatus,
        })
      ).toEqual({ ran: true, success: true, reason: 'synced' });
    }
  );

  it('reports a terminal repair state as failed', () => {
    expect(
      getProfileAnalyticsHistoryRequestResult({
        trigger: 'history_repair',
        hasLinkedInTab: true,
        historyStatus: 'needs_repair',
        historyLastError: 'No usable connection dates were found.',
      })
    ).toEqual({
      ran: true,
      success: false,
      reason: 'failed',
      error: 'No usable connection dates were found.',
    });
  });

  it('reports a failed batch even when the resumable job remains scheduled', () => {
    expect(
      getProfileAnalyticsHistoryRequestResult({
        trigger: 'history_resume',
        hasLinkedInTab: true,
        historyStatus: 'scheduled',
        historyLastError: 'LinkedIn request failed.',
      })
    ).toEqual({
      ran: true,
      success: false,
      reason: 'failed',
      error: 'LinkedIn request failed.',
    });
  });

  it('reports a missing LinkedIn tab without claiming that work ran', () => {
    expect(
      getProfileAnalyticsHistoryRequestResult({
        trigger: 'history_resume',
        hasLinkedInTab: false,
        historyStatus: 'scheduled',
      })
    ).toEqual({ ran: false, success: false, reason: 'no_linkedin_tab' });
  });
});
