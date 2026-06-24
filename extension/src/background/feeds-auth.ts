import type { User } from 'firebase/auth';
import type { UserFeatureSettings } from 'shared/types';
import { getCurrentUser, signInWithGoogleTokens, waitForAuthReady } from '../services/auth';

type OffscreenAuthResult =
  | {
      success: true;
      idToken: string;
      accessToken: string;
    }
  | {
      success: false;
      error: string;
    };

interface StoredFeedsAuthTokens {
  idToken: string;
  accessToken: string;
  updatedAt: number;
}

let pendingOffscreenAuth:
  | {
      resolve: (result: OffscreenAuthResult) => void;
      reject: (error: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  | null = null;

export const FEATURE_SETTINGS_STORAGE_KEY = 'pf_feature_settings';
export const DEFAULT_FEATURE_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
  hideProfileViewers: false,
};

export function normalizeFeatureSettings(settings?: Partial<UserFeatureSettings> | null): UserFeatureSettings {
  return {
    messagingButtons: settings?.messagingButtons ?? DEFAULT_FEATURE_SETTINGS.messagingButtons,
    postButtons: settings?.postButtons ?? DEFAULT_FEATURE_SETTINGS.postButtons,
    speechToComment: settings?.speechToComment ?? DEFAULT_FEATURE_SETTINGS.speechToComment,
    hideProfileViewers: settings?.hideProfileViewers ?? DEFAULT_FEATURE_SETTINGS.hideProfileViewers,
  };
}

export async function hasOffscreenDocument(): Promise<boolean> {
  const getContexts = chrome.runtime.getContexts?.bind(chrome.runtime);
  if (!getContexts) {
    return false;
  }

  const contexts = await getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL('offscreen.html')],
  });

  return contexts.length > 0;
}

export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
    justification: 'Authenticate the user with Firebase Google sign-in from an offscreen document.',
  });
}

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

export async function closeOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

export async function startOffscreenAuth(): Promise<OffscreenAuthResult> {
  await ensureOffscreenDocument();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(async () => {
      pendingOffscreenAuth = null;
      await closeOffscreenDocument();
      reject(new Error('Authentication timed out'));
    }, 90_000);

    pendingOffscreenAuth = { resolve, reject, timeoutId };

    chrome.runtime.sendMessage({ type: 'OFFSCREEN_AUTH_START' }).catch(async (error: Error) => {
      clearTimeout(timeoutId);
      pendingOffscreenAuth = null;
      await closeOffscreenDocument();
      reject(error);
    });
  });
}

export function formatUserInfo(user: { uid: string; displayName: string; email: string; photoURL: string }) {
  return {
    isAuthenticated: true,
    userId: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
  };
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
    hasStoredTokens: Boolean(
      stored.feedsAuthTokens?.idToken && stored.feedsAuthTokens?.accessToken
    ),
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
    return user;
  }

  // 2. Wait for Firebase to rehydrate from IndexedDB (service worker cold-start)
  user = await waitForAuthReady();
  if (user) {
    console.log('[feeds-auth] Restored session from IndexedDB');
    return user;
  }

  // 3. Check if we know the user was previously signed in
  const storedInfo = await getStorageValue<{ feedsUserInfo?: { isAuthenticated?: boolean } }>('feedsUserInfo');
  if (!storedInfo.feedsUserInfo?.isAuthenticated) {
    return null;
  }

  // 4. User was previously signed in but Firebase didn't restore — try stored Google tokens
  console.log('[feeds-auth] User was previously signed in, trying stored tokens…');
  user = await rehydrateFeedsAuthFromStoredTokens();
  if (user) {
    console.log('[feeds-auth] Restored session from stored tokens');
    return user;
  }

  // 5. Last resort: give Firebase one more chance with a longer timeout
  console.log('[feeds-auth] Stored tokens failed, final wait for Firebase…');
  user = await waitForAuthReady(5000);
  if (user) {
    console.log('[feeds-auth] Restored session on final attempt');
  }

  return user;
}


export function resolvePendingOffscreenAuth(result: unknown): void {
  const pending = pendingOffscreenAuth;
  pendingOffscreenAuth = null;
  if (!pending) {
    return;
  }
  clearTimeout(pending.timeoutId);
  pending.resolve(result as OffscreenAuthResult);
}
