import type { User } from 'firebase/auth';
import type { UserFeatureSettings, UserProfilePreferences } from 'shared/types';
import { DEFAULT_USER_PROFILE_PREFERENCES, normalizeUserProfilePreferences } from 'shared/user-profile-preferences';
import { getCurrentUser, signInWithGoogleTokens, waitForAuthReady } from '../../../../services/auth';
import { FEATURE_SETTINGS_STORAGE_KEY, normalizeFeatureSettings } from '../../../../shared/feature-settings';
import { ensureAuthenticatedUserProfile } from './user-profile-readiness';

export {
  DEFAULT_FEATURE_SETTINGS,
  FEATURE_SETTINGS_STORAGE_KEY,
  normalizeFeatureSettings,
} from '../../../../shared/feature-settings';

interface StoredFeedsAuthTokens {
  idToken: string;
  accessToken: string;
  updatedAt: number;
}

export const PROFILE_PREFERENCES_STORAGE_KEY = 'pf_profile_preferences';

export async function persistFeatureSettingsToStorage(settings: UserFeatureSettings): Promise<void> {
  await chrome.storage.local.set({ [FEATURE_SETTINGS_STORAGE_KEY]: settings });
}

export async function getStoredFeatureSettings(): Promise<UserFeatureSettings | null> {
  const result = await getStorageValue<{ [FEATURE_SETTINGS_STORAGE_KEY]?: Partial<UserFeatureSettings> }>([
    FEATURE_SETTINGS_STORAGE_KEY,
  ]);
  const stored = result[FEATURE_SETTINGS_STORAGE_KEY];
  return stored ? normalizeFeatureSettings(stored) : null;
}

export function formatUserInfo(
  user: { uid: string; displayName: string; email: string; photoURL: string },
  preferences: UserProfilePreferences = DEFAULT_USER_PROFILE_PREFERENCES
) {
  const normalized = normalizeUserProfilePreferences(preferences);
  return {
    isAuthenticated: true,
    userId: user.uid,
    displayName: normalized.displayName || user.displayName || '',
    email: user.email || '',
    photoURL: normalized.avatarDataUrl || user.photoURL || '',
    authDisplayName: user.displayName || '',
    authPhotoURL: user.photoURL || '',
    billingCurrency: normalized.billingCurrency,
  };
}

export async function persistUserProfilePreferencesToStorage(
  userId: string,
  preferences: UserProfilePreferences
): Promise<void> {
  await setStorageValue({
    [PROFILE_PREFERENCES_STORAGE_KEY]: {
      userId,
      preferences: normalizeUserProfilePreferences(preferences),
    },
  });
}

export async function getStoredUserProfilePreferences(userId: string): Promise<UserProfilePreferences | null> {
  const result = await getStorageValue<{
    [PROFILE_PREFERENCES_STORAGE_KEY]?: {
      userId?: string;
      preferences?: Partial<UserProfilePreferences>;
    };
  }>(PROFILE_PREFERENCES_STORAGE_KEY);
  const stored = result[PROFILE_PREFERENCES_STORAGE_KEY];
  return stored?.userId === userId ? normalizeUserProfilePreferences(stored.preferences) : null;
}

export function getStorageValue<T>(keys: string | string[]): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result as T));
  });
}

export function setStorageValue(value: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, () => resolve());
  });
}

export function removeStorageValue(keys: string | string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

export async function getStoredFeedsAuthTokens(): Promise<StoredFeedsAuthTokens | null> {
  const result = await getStorageValue<{ feedsAuthTokens?: StoredFeedsAuthTokens }>('feedsAuthTokens');
  return result.feedsAuthTokens || null;
}

export async function getStoredFeedsAuthContext(): Promise<{
  hasStoredUser: boolean;
  hasStoredTokens: boolean;
  userId?: string;
}> {
  const stored = await getStorageValue<{
    feedsUserInfo?: { isAuthenticated?: boolean; userId?: string };
    feedsAuthTokens?: StoredFeedsAuthTokens;
  }>(['feedsUserInfo', 'feedsAuthTokens']);

  return {
    hasStoredUser: stored.feedsUserInfo?.isAuthenticated === true,
    hasStoredTokens: Boolean(stored.feedsAuthTokens?.idToken && stored.feedsAuthTokens?.accessToken),
    userId:
      typeof stored.feedsUserInfo?.userId === 'string' && stored.feedsUserInfo.userId
        ? stored.feedsUserInfo.userId
        : undefined,
  };
}

export async function setStoredFeedsAuthTokens(tokens: StoredFeedsAuthTokens): Promise<void> {
  await setStorageValue({ feedsAuthTokens: tokens });
}

export async function clearStoredFeedsAuthTokens(): Promise<void> {
  await removeStorageValue('feedsAuthTokens');
}

export async function rehydrateFeedsAuthFromStoredTokens(): Promise<User | null> {
  const tokens = await getStoredFeedsAuthTokens();
  if (!tokens?.idToken || !tokens?.accessToken) {
    return null;
  }

  try {
    return await signInWithGoogleTokens(tokens.idToken, tokens.accessToken);
  } catch (error) {
    console.warn('[feeds-auth] Failed to rehydrate auth from stored tokens:', error);
    // Don't clear tokens on network/transient errors — only clear on definitive auth failures
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('invalid') || msg.includes('expired') || msg.includes('credential')) {
      await clearStoredFeedsAuthTokens();
    }
    return null;
  }
}

export async function getAuthenticatedFeedsUser(): Promise<User | null> {
  // 1. Check in-memory (fast path — service worker still alive)
  let user = getCurrentUser();
  if (user) {
    await ensureAuthenticatedUserProfile(user);
    return user;
  }

  // 2. Wait for Firebase to rehydrate from IndexedDB (service worker cold-start)
  user = await waitForAuthReady();
  if (user) {
    await ensureAuthenticatedUserProfile(user);
    return user;
  }

  // 3. Check if we know the user was previously signed in
  const storedInfo = await getStorageValue<{ feedsUserInfo?: { isAuthenticated?: boolean } }>('feedsUserInfo');
  if (!storedInfo.feedsUserInfo?.isAuthenticated) {
    return null;
  }

  // 4. User was previously signed in but Firebase didn't restore — try stored Google tokens
  user = await rehydrateFeedsAuthFromStoredTokens();
  if (user) {
    await ensureAuthenticatedUserProfile(user);
    return user;
  }

  // 5. Last resort: give Firebase one more chance with a longer timeout
  user = await waitForAuthReady(5000);
  if (user) {
    await ensureAuthenticatedUserProfile(user);
  }
  return user;
}
