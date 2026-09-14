import { getAuthenticatedFeedsUser } from '../auth/services/authenticated-user';
import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import { queueProfileViewersFirstSurfaceSync } from '../profile-viewers/profile-viewers-coordinator';
import {
  queueDashboardAnalyticsForLinkedInActivity,
  queueDashboardAnalyticsSync,
} from './dashboard-analytics-sync-coordinator';
import { getDashboardAnalyticsSyncStatus } from './dashboard-analytics-sync-runtime';

/**
 * Message sent by an extension UI surface (popup, LinkedIn sidebar) when the
 * user actually opens it. It is the only trigger allowed to create the
 * one-time Connections history bootstrap, and it is idempotent: the persisted
 * Firestore job is the source of truth, so later entries only resume.
 */
export const EXTENSION_UI_ENTERED_MESSAGE = 'EXTENSION_UI_ENTERED';

export async function handleExtensionUiEntered(preferredTabId?: number): Promise<{ queued: boolean }> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) return { queued: false };

  if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
    console.info('[dashboard-analytics] authenticated extension entry observed', { preferredTabId });
  }
  void queueProfileViewersFirstSurfaceSync('linkedin_activity').finally(() => {
    if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
      void queueDashboardAnalyticsSync('first_extension_entry', preferredTabId);
    }
  });
  return { queued: true };
}

export function registerDashboardAnalyticsMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === EXTENSION_UI_ENTERED_MESSAGE) {
      handleExtensionUiEntered(sender.tab?.id)
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((error) =>
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) })
        );
      return true;
    }

    if (message?.type === 'DASHBOARD_ANALYTICS_GET_SYNC_STATUS') {
      getDashboardAnalyticsSyncStatus()
        .then((status) => sendResponse({ success: true, status }))
        .catch((error) =>
          sendResponse({ success: false, status: null, error: error instanceof Error ? error.message : String(error) })
        );
      return true;
    }

    if (message?.type === 'DASHBOARD_ANALYTICS_CONNECTION_HISTORY_REPAIR_NOW') {
      sendResponse({ success: true, queued: false });
      return false;
    }

    if (message?.type !== 'DASHBOARD_ANALYTICS_LINKEDIN_ACTIVITY') return false;

    void queueProfileViewersFirstSurfaceSync('linkedin_activity').finally(() => {
      if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
        void queueDashboardAnalyticsForLinkedInActivity(sender.tab?.id).catch((error) => {
          console.warn('[dashboard-analytics] LinkedIn activity sync failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    });
    sendResponse({ success: true, queued: true });
    return false;
  });
}
