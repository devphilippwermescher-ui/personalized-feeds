import { signOutUser } from '../../../../services/auth';
import {
  getUserFeatureSettings,
  updateUserFeatureSettings,
  updateUserProfilePreferences,
} from 'shared/firestore-service';
import type { UserFeatureSettings, UserProfilePreferences } from 'shared/types';
import { isBillingCurrency, normalizeUserProfilePreferences } from 'shared/user-profile-preferences';
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
  persistUserProfilePreferencesToStorage,
  PROFILE_PREFERENCES_STORAGE_KEY,
  removeStorageValue,
  resolvePendingOffscreenAuth,
  startOffscreenAuth,
} from '../services/authenticated-user';
import { resetAuthenticatedUserProfileReadiness } from '../services/user-profile-readiness';
import { clearProfileViewersAlarm } from '../../profile-viewers/profile-viewers-coordinator-storage';
import { normalizeFeedsError } from '../../feeds/errors/feeds-error';
import {
  authenticateFeedsWithEmail,
  authenticateFeedsWithGoogle,
  registerFeedsWithEmail,
  resolveUserProfilePreferences,
  schedulePostSignInWork,
} from '../services/authenticated-session';

const MAX_PROFILE_AVATAR_DATA_URL_LENGTH = 300_000;

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

export function registerAuthSettingsMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OFFSCREEN_AUTH_RESULT') {
      resolvePendingOffscreenAuth(message);
      void closeOffscreenDocument();

      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'FEEDS_GET_AUTH_STATE') {
      void (async () => {
        const user = await getAuthenticatedFeedsUser();
        if (user) {
          const preferences = await resolveUserProfilePreferences(user.uid);
          const info = formatUserInfo(
            {
              uid: user.uid,
              displayName: user.displayName || '',
              email: user.email || '',
              photoURL: user.photoURL || '',
            },
            preferences
          );
          chrome.storage.local.set({ feedsUserInfo: info });
          sendResponse(info);
        } else {
          // Don't clear feedsUserInfo here — it's needed for session recovery on cold-starts.
          // It's only cleared on explicit sign-out (FEEDS_SIGN_OUT).
          sendResponse({ isAuthenticated: false });
        }
      })().catch((error) => {
        console.error('[feeds-auth] Failed to initialize the authenticated user profile:', error);
        sendResponse({
          isAuthenticated: false,
          error: normalizeFeedsError(error, 'Account profile could not be initialized'),
        });
      });
      return true;
    }

    if (message.type === 'FEEDS_SIGN_IN') {
      startOffscreenAuth()
        .then(async (result) => {
          if (!result.success) {
            console.warn('[feeds-auth] Offscreen auth failed:', result.error);
            sendResponse({ success: false, error: result.error });
            return;
          }

          const user = await authenticateFeedsWithGoogle({
            idToken: result.idToken,
            accessToken: result.accessToken,
          });
          if (message.deferPostAuthWork !== true) {
            schedulePostSignInWork();
          }
          sendResponse({ success: true, userId: user.uid });
        })
        .catch((error) => {
          console.error('[feeds-auth] Sign-in error:', error);
          sendResponse({ success: false, error: normalizeFeedsError(error, 'Sign in failed') });
        });
      return true;
    }

    if (message.type === 'FEEDS_EMAIL_SIGN_IN') {
      Promise.resolve()
        .then(async () => {
          const user = await authenticateFeedsWithEmail(message as Record<string, unknown>);
          if (message.deferPostAuthWork !== true) {
            schedulePostSignInWork();
          }
          sendResponse({ success: true, userId: user.uid });
        })
        .catch((error) => {
          console.error('[feeds-auth] Email sign-in error:', error);
          sendResponse({ success: false, error: normalizeFeedsError(error, 'Sign in failed') });
        });
      return true;
    }

    if (message.type === 'FEEDS_EMAIL_SIGN_UP') {
      Promise.resolve()
        .then(async () => {
          const user = await registerFeedsWithEmail(message as Record<string, unknown>);
          if (message.deferPostAuthWork !== true) {
            schedulePostSignInWork();
          }
          sendResponse({ success: true, userId: user.uid });
        })
        .catch((error) => {
          console.error('[feeds-auth] Email registration error:', error);
          sendResponse({ success: false, error: normalizeFeedsError(error, 'Account creation failed') });
        });
      return true;
    }

    if (message.type === 'FEEDS_AUTH_SURFACE_READY') {
      schedulePostSignInWork();
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'FEEDS_SIGN_OUT') {
      signOutUser()
        .then(async () => {
          resetAuthenticatedUserProfileReadiness();
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
}
