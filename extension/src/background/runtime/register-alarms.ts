import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import { queueDashboardAnalyticsSync } from '../features/dashboard-analytics/dashboard-analytics-sync-coordinator';
import {
  clearDashboardAnalyticsAlarm,
  DASHBOARD_ANALYTICS_ALARM_NAME,
} from '../features/dashboard-analytics/dashboard-analytics-sync-runtime';
import { queueProfileViewersFirstSurfaceSync } from '../features/profile-viewers/profile-viewers-coordinator';
import {
  appendProfileViewersWakeEvent,
  PROFILE_VIEWERS_ALARM_NAME,
} from '../features/profile-viewers/profile-viewers-coordinator-storage';
import {
  PROFILE_VIEWERS_STATUS_ALARM_NAME,
  runProfileViewersStatusSync,
} from '../features/profile-viewers/profile-viewers-status-sync';
import { queueDashboardAnalyticsWhenEnabled } from './dashboard-analytics-runtime';

export function registerBackgroundAlarmHandlers(): void {
  chrome.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === DASHBOARD_ANALYTICS_ALARM_NAME) {
      if (!DASHBOARD_ANALYTICS_SYNC_ENABLED) {
        void clearDashboardAnalyticsAlarm();
        return;
      }
      const receivedAt = Date.now();
      console.info('[dashboard-analytics] alarm fired', {
        alarmName: alarm.name,
        scheduledAt: alarm.scheduledTime,
        scheduledAtIso: new Date(alarm.scheduledTime).toISOString(),
        receivedAt,
        receivedAtIso: new Date(receivedAt).toISOString(),
        delayMs: Math.max(0, receivedAt - alarm.scheduledTime),
      });
      void queueDashboardAnalyticsSync('alarm');
      return;
    }
    if (alarm.name === PROFILE_VIEWERS_STATUS_ALARM_NAME) {
      void runProfileViewersStatusSync('alarm');
      return;
    }
    if (alarm.name !== PROFILE_VIEWERS_ALARM_NAME) return;

    void appendProfileViewersWakeEvent({
      event: 'alarm_received',
      trigger: 'alarm',
      scheduledAt: alarm.scheduledTime,
    });
    void queueProfileViewersFirstSurfaceSync('alarm').finally(() => {
      queueDashboardAnalyticsWhenEnabled('alarm');
    });
  });
}
