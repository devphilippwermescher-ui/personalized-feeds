import { getCurrentUser } from '../services/auth';
import { updateUserFeatureSettings } from 'shared/firestore-service';
import type { UserFeatureSettings } from 'shared/types';
import { getProfileAnalyticsSyncStatus, queueProfileAnalyticsSync } from './profile-analytics-sync-coordinator';
import {
  formatUserInfo,
  getAuthenticatedFeedsUser,
  persistFeatureSettingsToStorage,
  startOffscreenAuth,
} from './feeds-auth';
import { resetCurrentUserAnalyticsForDevelopment } from './profile-analytics-dev-reset';

const DASHBOARD_ORIGIN = 'https://linkedin-feed-sorter.web.app';

interface DashboardMessage {
  type?: string;
  settings?: Partial<UserFeatureSettings>;
}

function isDashboardOrigin(urlValue: string | undefined): boolean {
  if (!urlValue) return false;
  try {
    const url = new URL(urlValue);
    return url.origin === DASHBOARD_ORIGIN || (url.protocol === 'http:' && url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function handleDashboardMessage(message: DashboardMessage, sendResponse: (response: unknown) => void): boolean {
  if (message.type === 'DASHBOARD_GET_EXTENSION_AUTH_STATE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse({ success: true, isAuthenticated: false });
          return;
        }
        sendResponse({
          success: true,
          ...formatUserInfo({
            uid: user.uid,
            displayName: user.displayName || '',
            email: user.email || '',
            photoURL: user.photoURL || '',
          }),
        });
      })
      .catch(() => sendResponse({ success: true, isAuthenticated: false }));
    return true;
  }

  if (message.type === 'DASHBOARD_SYNC_AUTH') {
    startOffscreenAuth()
      .then((result) => {
        if (!result.success) {
          sendResponse({ success: false, error: result.error });
          return;
        }
        sendResponse({ success: true, idToken: result.idToken, accessToken: result.accessToken });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message.type === 'DASHBOARD_SYNC_SETTINGS') {
    const user = getCurrentUser();
    if (!user) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return false;
    }
    updateUserFeatureSettings(user.uid, message.settings || {})
      .then(async (settings) => {
        await persistFeatureSettingsToStorage(settings);
        sendResponse({ success: true, settings });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message.type === 'DASHBOARD_ANALYTICS_OPENED' || message.type === 'DASHBOARD_PROFILE_ANALYTICS_OPENED') {
    // Compatibility no-op for an older deployed dashboard. Dashboard pages
    // are Firestore readers and are never allowed to start LinkedIn work.
    sendResponse({ success: true, queued: false });
    return false;
  }

  // `DASHBOARD_GET_PROFILE_ANALYTICS_SYNC_STATUS` is the pre-Dashboard-Analytics
  // name. Already-deployed dashboards still send it, so both are accepted.
  if (
    message.type === 'DASHBOARD_GET_ANALYTICS_SYNC_STATUS' ||
    message.type === 'DASHBOARD_GET_PROFILE_ANALYTICS_SYNC_STATUS'
  ) {
    getProfileAnalyticsSyncStatus()
      .then((status) => sendResponse({ success: true, status }))
      .catch((error) => {
        sendResponse({
          success: false,
          status: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  }

  if (
    message.type === 'DASHBOARD_RESUME_ANALYTICS_HISTORY' ||
    message.type === 'DASHBOARD_RESUME_PROFILE_ANALYTICS_HISTORY'
  ) {
    // Compatibility no-op. Recovery belongs to the extension background
    // scheduler; a Dashboard action must never start LinkedIn work.
    sendResponse({ success: true, queued: false });
    return false;
  }

  if (message.type === 'DASHBOARD_DEV_RESET_ANALYTICS') {
    if (!__MFP_DEV_BUILD__) {
      sendResponse({ success: false, error: 'Development tools are disabled in this extension build.' });
      return false;
    }

    resetCurrentUserAnalyticsForDevelopment()
      .then((result) => {
        sendResponse({ success: true, result, collectionQueued: true });
        // Profile Viewers data and scheduling are deliberately preserved.
        void queueProfileAnalyticsSync('install');
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  }

  sendResponse({ success: false, error: 'Unsupported dashboard message' });
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'DASHBOARD_EXTENSION_BRIDGE_REQUEST') return false;
  if (!isDashboardOrigin(sender.tab?.url || sender.url)) {
    sendResponse({ success: false, error: 'Unauthorized dashboard origin' });
    return false;
  }
  return handleDashboardMessage(message.dashboardMessage || {}, sendResponse);
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isDashboardOrigin(sender.url)) {
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return false;
  }
  return handleDashboardMessage(message || {}, sendResponse);
});
