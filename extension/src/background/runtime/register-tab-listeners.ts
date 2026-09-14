import { forgetDashboardAnalyticsLinkedInTab } from '../features/dashboard-analytics/dashboard-analytics-sync-coordinator';

export function registerBackgroundTabListeners(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    forgetDashboardAnalyticsLinkedInTab(tabId);
  });
}
