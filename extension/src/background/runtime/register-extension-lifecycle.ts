import type { ProfileViewersSyncTrigger } from '../features/profile-viewers/profile-viewers-sync-state';
import { appendProfileViewersWakeEvent } from '../features/profile-viewers/profile-viewers-coordinator-storage';
import { queueProfileViewersFirstSurfaceSync } from '../features/profile-viewers/profile-viewers-coordinator';
import { queueProfileViewersStatusSync } from '../features/profile-viewers/profile-viewers-status-sync';
import { reinjectLinkedInContentRuntimeIntoOpenTabs } from './reinject-linkedin-content-runtime';
import { queueDashboardAnalyticsWhenEnabled } from './dashboard-analytics-runtime';

export function registerExtensionLifecycle(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    const trigger: ProfileViewersSyncTrigger = details.reason === 'install' ? 'install' : 'update';
    void reinjectLinkedInContentRuntimeIntoOpenTabs();
    void appendProfileViewersWakeEvent({
      event: 'runtime_installed',
      trigger,
      reason: details.reason,
    });
    // The sidebar is the first product surface a newly installed user sees.
    // Let Profile Viewers finish (or safely defer under its own budget) before
    // Profile Analytics is allowed to acquire the Connections-history lock.
    void queueProfileViewersFirstSurfaceSync(trigger).finally(() => {
      void queueProfileViewersStatusSync({ trigger, urgent: true });
      queueDashboardAnalyticsWhenEnabled(trigger);
    });
  });

  chrome.runtime.onStartup.addListener(() => {
    void appendProfileViewersWakeEvent({
      event: 'chrome_startup',
      trigger: 'chrome_startup',
    });
    void queueProfileViewersFirstSurfaceSync('chrome_startup').finally(() => {
      void queueProfileViewersStatusSync({ trigger: 'chrome_startup' });
      queueDashboardAnalyticsWhenEnabled('chrome_startup');
    });
  });
}
