import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import { CONNECTION_INVITES_STATUS_ALARM_NAME } from '../features/connection-invites/services/sync';
import {
  clearDashboardAnalyticsAlarm,
  DASHBOARD_ANALYTICS_ALARM_NAME,
} from '../features/dashboard-analytics/dashboard-analytics-sync-runtime';
import { queueProfileViewersFirstSurfaceSync } from '../features/profile-viewers/profile-viewers-coordinator';
import { appendProfileViewersWakeEvent } from '../features/profile-viewers/profile-viewers-coordinator-storage';
import { queueProfileViewersStatusSync } from '../features/profile-viewers/profile-viewers-status-sync';
import { migrateToIndependentLinkedInSync } from './migrations/migrate-linkedin-sync-state';
import { queueDashboardAnalyticsWhenEnabled } from './dashboard-analytics-runtime';
import { reinjectLinkedInContentRuntimeIntoOpenTabs } from './reinject-linkedin-content-runtime';

export function startBackgroundRuntime(): void {
  void appendProfileViewersWakeEvent({
    event: 'worker_loaded',
    trigger: 'service_worker',
  });
  // A manual Reload from chrome://extensions starts a fresh service worker but
  // does not reliably deliver onInstalled. Restore content UI in already-open
  // LinkedIn tabs from the worker lifecycle itself as well.
  void reinjectLinkedInContentRuntimeIntoOpenTabs();
  // Acceptance Rate is now reconciled by the shared Profile Analytics alarm.
  // Remove the legacy standalone invitation-status alarm after upgrading.
  void chrome.alarms?.clear(CONNECTION_INVITES_STATUS_ALARM_NAME);

  if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
    void chrome.alarms?.get(DASHBOARD_ANALYTICS_ALARM_NAME).then((alarm) => {
      console.info('[dashboard-analytics] alarm state on worker load', {
        alarmName: DASHBOARD_ANALYTICS_ALARM_NAME,
        exists: Boolean(alarm),
        scheduledAt: alarm?.scheduledTime,
        scheduledAtIso: alarm ? new Date(alarm.scheduledTime).toISOString() : undefined,
      });
    });
  } else {
    void clearDashboardAnalyticsAlarm();
  }

  void migrateToIndependentLinkedInSync()
    .then(() => queueProfileViewersFirstSurfaceSync('service_worker'))
    .finally(() => {
      void queueProfileViewersStatusSync({ trigger: 'service_worker' });
      queueDashboardAnalyticsWhenEnabled('service_worker');
    });
}
