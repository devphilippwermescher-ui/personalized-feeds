import { signInWithGoogleTokens, signOutUser } from '../services/auth';
import { getUserFeatureSettings, updateUserFeatureSettings } from 'shared/firestore-service';
import type { UserFeatureSettings } from 'shared/types';
import {
  clearStoredFeedsAuthTokens,
  closeOffscreenDocument,
  DEFAULT_FEATURE_SETTINGS,
  FEATURE_SETTINGS_STORAGE_KEY,
  formatUserInfo,
  getAuthenticatedFeedsUser,
  getStoredFeatureSettings,
  normalizeFeatureSettings,
  persistFeatureSettingsToStorage,
  removeStorageValue,
  resolvePendingOffscreenAuth,
  setStoredFeedsAuthTokens,
  startOffscreenAuth,
} from './feeds-auth';
import {
  appendProfileViewersWakeEvent,
  clearProfileViewersAlarm,
} from './profile-viewers-coordinator-storage';
import { queueProfileViewersSync } from './profile-viewers-coordinator';
import { normalizeFeedsError } from './feeds-errors';
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_AUTH_RESULT') {
    resolvePendingOffscreenAuth(message);
    void closeOffscreenDocument();

    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'FEEDS_GET_AUTH_STATE') {
    (async () => {
      const user = await getAuthenticatedFeedsUser();
      if (user) {
        const info = formatUserInfo({
          uid: user.uid,
          displayName: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || '',
        });
        chrome.storage.local.set({ feedsUserInfo: info });
        sendResponse(info);
      } else {
        // Don't clear feedsUserInfo here — it's needed for session recovery on cold-starts.
        // It's only cleared on explicit sign-out (FEEDS_SIGN_OUT).
        sendResponse({ isAuthenticated: false });
      }
    })();
    return true;
  }

  if (message.type === 'FEEDS_SIGN_IN') {
    console.log('[feeds-auth] Starting sign-in flow…');
    startOffscreenAuth()
      .then(async (result) => {
        if (!result.success) {
          console.warn('[feeds-auth] Offscreen auth failed:', result.error);
          sendResponse({ success: false, error: result.error });
          return;
        }

        console.log('[feeds-auth] Tokens received, signing in with Firebase…');
        const user = await signInWithGoogleTokens(result.idToken, result.accessToken);
        console.log('[feeds-auth] Firebase sign-in successful, uid:', user.uid);

        await setStoredFeedsAuthTokens({
          idToken: result.idToken,
          accessToken: result.accessToken,
          updatedAt: Date.now(),
        });

        chrome.storage.local.set({
          feedsUserInfo: formatUserInfo({
            uid: user.uid,
            displayName: user.displayName || '',
            email: user.email || '',
            photoURL: user.photoURL || '',
          }),
        });
        sendResponse({ success: true, userId: user.uid });
        void appendProfileViewersWakeEvent({
          event: 'sign_in',
          trigger: 'sign_in',
        });
        void queueProfileViewersSync('sign_in');
      })
      .catch((error) => {
        console.error('[feeds-auth] Sign-in error:', error);
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Sign in failed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_SIGN_OUT') {
    signOutUser()
      .then(async () => {
        await Promise.all([
          removeStorageValue('feedsUserInfo'),
          removeStorageValue(FEATURE_SETTINGS_STORAGE_KEY),
          clearStoredFeedsAuthTokens(),
          clearProfileViewersAlarm('explicit_sign_out'),
        ]);
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'SETTINGS_GET') {
    getStoredFeatureSettings()
      .then((user) => {
        if (user) {
          sendResponse({ success: true, settings: user });
          return;
        }

        return getAuthenticatedFeedsUser().then((authUser) => {
          if (!authUser) {
            sendResponse({ success: true, settings: DEFAULT_FEATURE_SETTINGS });
            return;
          }

          return getUserFeatureSettings(authUser.uid)
            .then(async (settings) => {
              const normalized = normalizeFeatureSettings(settings);
              await persistFeatureSettingsToStorage(normalized);
              sendResponse({ success: true, settings: normalized });
            })
            .catch(async (error) => {
              console.warn('[feature-settings] SETTINGS_GET remote fallback failed:', error);
              sendResponse({ success: true, settings: DEFAULT_FEATURE_SETTINGS });
            });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message.type === 'SETTINGS_UPDATE') {
    Promise.all([getStoredFeatureSettings(), getAuthenticatedFeedsUser()])
      .then(async ([storedSettings, user]) => {
        const nextSettings = normalizeFeatureSettings({
          ...(storedSettings || DEFAULT_FEATURE_SETTINGS),
          ...((message.updates || {}) as Partial<UserFeatureSettings>),
        });

        await persistFeatureSettingsToStorage(nextSettings);
        sendResponse({ success: true, settings: nextSettings });

        if (!user) {
          return;
        }

        updateUserFeatureSettings(user.uid, nextSettings).catch((error) => {
          console.warn('[feature-settings] SETTINGS_UPDATE remote sync failed:', error);
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  return false;
});
