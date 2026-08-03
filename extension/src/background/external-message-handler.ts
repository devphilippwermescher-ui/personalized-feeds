import { getCurrentUser } from '../services/auth';
import { updateUserFeatureSettings } from 'shared/firestore-service';
import type { UserFeatureSettings } from 'shared/types';
import {
  formatUserInfo,
  getAuthenticatedFeedsUser,
  persistFeatureSettingsToStorage,
  startOffscreenAuth,
} from './feeds-auth';
import { syncProfileAnalyticsFromLinkedInTabs } from './profile-analytics-sync';

const DASHBOARD_ORIGIN = 'https://linkedin-feed-sorter.web.app';

function isDashboardOrigin(urlValue: string | undefined): boolean {
  if (!urlValue) {
    return false;
  }

  try {
    const url = new URL(urlValue);
    return url.origin === DASHBOARD_ORIGIN || (url.protocol === 'http:' && url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function syncProfileAnalyticsForDashboard(sendResponse: (response: unknown) => void): void {
  syncProfileAnalyticsFromLinkedInTabs()
    .then((result) => {
      sendResponse({ success: true, result });
    })
    .catch((error) => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'DASHBOARD_EXTENSION_BRIDGE_REQUEST') {
    return false;
  }

  if (!isDashboardOrigin(sender.tab?.url || sender.url)) {
    sendResponse({ success: false, error: 'Unauthorized dashboard origin' });
    return false;
  }

  const dashboardMessage = message.dashboardMessage as { type?: string } | undefined;
  if (dashboardMessage?.type !== 'DASHBOARD_PROFILE_ANALYTICS_SYNC_NOW') {
    sendResponse({ success: false, error: 'Unsupported dashboard message' });
    return false;
  }

  syncProfileAnalyticsForDashboard(sendResponse);
  return true;
});
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isDashboardOrigin(sender.url)) {
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return true;
  }

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
      .catch(() => {
        sendResponse({ success: true, isAuthenticated: false });
      });
    return true;
  }

  if (message.type === 'DASHBOARD_SYNC_AUTH') {
    startOffscreenAuth()
      .then((result) => {
        if (!result.success) {
          sendResponse({ success: false, error: result.error });
          return;
        }

        sendResponse({
          success: true,
          idToken: result.idToken,
          accessToken: result.accessToken,
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  }

  if (message.type === 'DASHBOARD_SYNC_SETTINGS') {
    const user = getCurrentUser();
    if (!user) {
      sendResponse({ success: false, error: 'Not authenticated' });
      return true;
    }

    updateUserFeatureSettings(user.uid, (message.settings || {}) as Partial<UserFeatureSettings>)
      .then(async (settings) => {
        await persistFeatureSettingsToStorage(settings);
        sendResponse({ success: true, settings });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message.type === 'DASHBOARD_PROFILE_ANALYTICS_SYNC_NOW') {
    syncProfileAnalyticsForDashboard(sendResponse);
    return true;
  }

  sendResponse({ success: false, error: 'Unsupported message' });
  return true;
});
