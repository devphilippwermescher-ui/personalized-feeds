/**
 * Compatibility facade for the former Profile Analytics Sync.
 *
 * Profile Analytics is now one source inside Dashboard Analytics Sync, which
 * also collects Content Analytics and publishes both under a single sync run.
 * The old public names keep working so already-deployed content scripts,
 * message handlers and dashboards do not break during rollout; new code should
 * import from `./dashboard-analytics/dashboard-analytics-sync-coordinator`.
 */
import {
  forgetDashboardAnalyticsLinkedInTab,
  queueDashboardAnalyticsForLinkedInActivity,
  queueDashboardAnalyticsSync,
  type DashboardAnalyticsSyncResult,
} from './dashboard-analytics/dashboard-analytics-sync-coordinator';
import type { DashboardAnalyticsSyncTrigger } from './dashboard-analytics/dashboard-analytics-sync-policy';

export { PROFILE_ANALYTICS_ALARM_NAME } from './profile-analytics-sync-runtime';
export { getDashboardAnalyticsSyncStatus as getProfileAnalyticsSyncStatus } from './dashboard-analytics/dashboard-analytics-sync-runtime';

export type ProfileAnalyticsSyncTrigger = DashboardAnalyticsSyncTrigger;

export interface ProfileAnalyticsSyncResult {
  ran: boolean;
  success: boolean;
  currentSynced: boolean;
  historySynced: boolean;
  reason: 'fresh' | 'no_auth' | 'no_linkedin_tab' | 'profile_viewers_pending' | 'synced' | 'failed';
  error?: string;
}

function toProfileAnalyticsSyncResult(result: DashboardAnalyticsSyncResult): ProfileAnalyticsSyncResult {
  return {
    ran: result.ran,
    success: result.success,
    currentSynced: result.currentSynced,
    historySynced: result.historySynced,
    reason: result.reason,
    error: result.error,
  };
}

export function queueProfileAnalyticsSync(
  trigger: ProfileAnalyticsSyncTrigger,
  preferredTabId?: number
): Promise<ProfileAnalyticsSyncResult> {
  return queueDashboardAnalyticsSync(trigger, preferredTabId).then(toProfileAnalyticsSyncResult);
}

export function queueProfileAnalyticsForLinkedInActivity(tabId?: number): Promise<ProfileAnalyticsSyncResult> {
  return queueDashboardAnalyticsForLinkedInActivity(tabId).then(toProfileAnalyticsSyncResult);
}

export function forgetProfileAnalyticsLinkedInTab(tabId: number): void {
  forgetDashboardAnalyticsLinkedInTab(tabId);
}
