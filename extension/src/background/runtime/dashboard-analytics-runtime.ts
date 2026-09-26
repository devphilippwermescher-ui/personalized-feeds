import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import { queueDashboardAnalyticsSync } from '../features/dashboard-analytics/dashboard-analytics-sync-coordinator';

export function queueDashboardAnalyticsWhenEnabled(trigger: Parameters<typeof queueDashboardAnalyticsSync>[0]): void {
  if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
    void queueDashboardAnalyticsSync(trigger);
  }
}
