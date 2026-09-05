import { signInWithGoogleTokens, signOutUser } from '../services/auth';
import {
  getUserFeatureSettings,
  getUserProfilePreferences,
  updateUserFeatureSettings,
  updateUserProfilePreferences,
} from 'shared/firestore-service';
import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import type { UserFeatureSettings, UserProfilePreferences } from 'shared/types';
import {
  DEFAULT_USER_PROFILE_PREFERENCES,
  isBillingCurrency,
  normalizeUserProfilePreferences,
} from 'shared/user-profile-preferences';
import {
  clearStoredFeedsAuthTokens,
  closeOffscreenDocument,
  DEFAULT_FEATURE_SETTINGS,
  FEATURE_SETTINGS_STORAGE_KEY,
  formatUserInfo,
  getAuthenticatedFeedsUser,
  getStoredFeatureSettings,
  getStoredUserProfilePreferences,
  normalizeFeatureSettings,
  persistFeatureSettingsToStorage,
  persistUserProfilePreferencesToStorage,
  PROFILE_PREFERENCES_STORAGE_KEY,
  removeStorageValue,
  resolvePendingOffscreenAuth,
  setStoredFeedsAuthTokens,
  startOffscreenAuth,
} from './feeds-auth';
import { appendProfileViewersWakeEvent, clearProfileViewersAlarm } from './profile-viewers-coordinator-storage';
import { queueProfileViewersFirstSurfaceSync } from './profile-viewers-coordinator';
import { queueProfileViewersStatusSync } from './profile-viewers-status-sync';
import { queueProfileAnalyticsSync } from './profile-analytics-sync-coordinator';
import { normalizeFeedsError } from './feeds-errors';

const MAX_PROFILE_AVATAR_DATA_URL_LENGTH = 300_000;

async function resolveUserProfilePreferences(userId: string): Promise<UserProfilePreferences> {
  const stored = await getStoredUserProfilePreferences(userId);
  try {
    const preferences = await getUserProfilePreferences(userId);
    await persistUserProfilePreferencesToStorage(userId, preferences);
    return preferences;
  } catch (error) {
    console.warn('[profile-preferences] Remote preferences could not be loaded:', error);
    return stored || DEFAULT_USER_PROFILE_PREFERENCES;
  }
}

function validateProfilePreferences(value: unknown): UserProfilePreferences {
  if (!value || typeof value !== 'object') {
    throw new Error('Profile preferences are missing.');
  }

  const candidate = value as Partial<UserProfilePreferences>;
  if (typeof candidate.displayName !== 'string' || candidate.displayName.trim().length > 60) {
    throw new Error('Display name must be 60 characters or fewer.');
  }
  if (!isBillingCurrency(candidate.billingCurrency)) {
    throw new Error('Choose EUR or USD.');
  }
  if (typeof candidate.avatarDataUrl !== 'string') {
    throw new Error('Avatar is invalid.');
  }
  if (
    candidate.avatarDataUrl &&
    (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(candidate.avatarDataUrl) ||
      candidate.avatarDataUrl.length > MAX_PROFILE_AVATAR_DATA_URL_LENGTH)
  ) {
    throw new Error('Avatar must be a JPG, PNG, or WebP image under 5 MB.');
  }

  return normalizeUserProfilePreferences(candidate);
}

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
        const preferences = await resolveUserProfilePreferences(user.uid);
        const info = formatUserInfo({
          uid: user.uid,
          displayName: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || '',
        }, preferences);
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
          feedsUserInfo: formatUserInfo(
            {
              uid: user.uid,
              displayName: user.displayName || '',
              email: user.email || '',
              photoURL: user.photoURL || '',
            },
            await resolveUserProfilePreferences(user.uid)
          ),
        });
        sendResponse({ success: true, userId: user.uid });
        void appendProfileViewersWakeEvent({
          event: 'sign_in',
          trigger: 'sign_in',
        });
        // Prepare the first surface the user sees before Profile Analytics can
        // acquire the one-time Connections-history lock. The forced viewer run
        // still respects its cooldown and request-token budget.
        void queueProfileViewersFirstSurfaceSync('sign_in').finally(() => {
          void queueProfileViewersStatusSync({ trigger: 'sign_in', urgent: true });
          // Signing in from the Sidebar is itself the first authenticated
          // extension entry. The analytics coordinator records that fact but
          // remains gated until Profile Visitors and its summary are complete.
          if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
            void queueProfileAnalyticsSync('first_extension_entry');
          }
        });
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
          removeStorageValue(PROFILE_PREFERENCES_STORAGE_KEY),
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

  if (message.type === 'PROFILE_PREFERENCES_GET') {
    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) throw new Error('Sign in to edit your profile.');
        const preferences = await resolveUserProfilePreferences(user.uid);
        sendResponse({
          success: true,
          preferences,
          user: formatUserInfo(
            {
              uid: user.uid,
              displayName: user.displayName || '',
              email: user.email || '',
              photoURL: user.photoURL || '',
            },
            preferences
          ),
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message.type === 'PROFILE_PREFERENCES_UPDATE') {
    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) throw new Error('Sign in to edit your profile.');
        const preferences = validateProfilePreferences(message.preferences);
        const saved = await updateUserProfilePreferences(user.uid, preferences);
        await persistUserProfilePreferencesToStorage(user.uid, saved);
        const info = formatUserInfo(
          {
            uid: user.uid,
            displayName: user.displayName || '',
            email: user.email || '',
            photoURL: user.photoURL || '',
          },
          saved
        );
        await chrome.storage.local.set({ feedsUserInfo: info });
        sendResponse({ success: true, preferences: saved, user: info });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
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
