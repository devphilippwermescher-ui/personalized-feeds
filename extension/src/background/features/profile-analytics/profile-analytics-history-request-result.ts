import type { ProfileAnalyticsConnectionHistoryBootstrapState } from 'shared/types';
import type { ProfileAnalyticsSyncTrigger } from './profile-analytics-sync-policy';

export interface ProfileAnalyticsHistoryRequestResult {
  ran: boolean;
  success: boolean;
  reason: 'no_linkedin_tab' | 'synced' | 'failed';
  error?: string;
}

export function getProfileAnalyticsHistoryRequestResult({
  trigger,
  hasLinkedInTab,
  historyStatus,
  historyLastError,
}: {
  trigger: ProfileAnalyticsSyncTrigger;
  hasLinkedInTab: boolean;
  historyStatus?: ProfileAnalyticsConnectionHistoryBootstrapState;
  historyLastError?: string;
}): ProfileAnalyticsHistoryRequestResult | undefined {
  if (trigger !== 'history_resume' && trigger !== 'history_repair') return undefined;
  if (!hasLinkedInTab) {
    return { ran: false, success: false, reason: 'no_linkedin_tab' };
  }

  const failed = historyStatus === 'needs_repair' || Boolean(historyLastError);
  const accepted =
    !failed && (historyStatus === 'scheduled' || historyStatus === 'running' || historyStatus === 'complete');
  return {
    ran: true,
    success: accepted,
    reason: accepted ? 'synced' : 'failed',
    ...(!accepted && historyLastError ? { error: historyLastError } : {}),
  };
}
