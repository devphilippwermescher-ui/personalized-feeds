import { getCurrentUser } from '../services/auth';
import { updateUserFeatureSettings } from 'shared/firestore-service';
import type { UserFeatureSettings } from 'shared/types';
import {
  formatUserInfo,
  getAuthenticatedFeedsUser,
  persistFeatureSettingsToStorage,
  startOffscreenAuth,
} from './feeds-auth';

const DASHBOARD_ORIGINS = new Set([
  'https://linkedin-feed-sorter.web.app',
  'http://localhost:5173',
]);

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const senderOrigin = sender.url ? new URL(sender.url).origin : null;
  if (!senderOrigin || !DASHBOARD_ORIGINS.has(senderOrigin)) {
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

  sendResponse({ success: false, error: 'Unsupported message' });
  return true;
});
