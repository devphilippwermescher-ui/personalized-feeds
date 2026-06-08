import { signInWithGoogleTokens, signOutUser, getCurrentUser, waitForAuthReady } from '../services/auth';
import {
  createFeed,
  getFeeds,
  addMemberToFeed,
  removeMemberFromFeed,
  getFeedMembers,
  getProfileFeedMemberships,
  deleteFeed,
  updateFeed,
  updateMemberInFeed,
  reorderFeeds,
  duplicateSharedFeed,
  ensureFeedShareLink,
  followFeedByShareToken,
  getFeedShares,
  getFollowedFeeds,
  getUserFeatureSettings,
  shareFeedWithUser,
  unfollowFeed,
  removeFeedShare,
  updateFeedShareRole,
  updateUserFeatureSettings,
} from 'shared/firestore-service';
import type { LinkedInProfileData, UserFeatureSettings } from 'shared/types';
import type { User } from 'firebase/auth';

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

const DASHBOARD_ORIGINS = new Set([
  'https://linkedin-feed-sorter.web.app',
  'http://localhost:5173',
]);
const FEATURE_SETTINGS_STORAGE_KEY = 'pf_feature_settings';

const DEFAULT_FEATURE_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
};

function normalizeFeatureSettings(settings?: Partial<UserFeatureSettings> | null): UserFeatureSettings {
  return {
    messagingButtons: settings?.messagingButtons ?? DEFAULT_FEATURE_SETTINGS.messagingButtons,
    postButtons: settings?.postButtons ?? DEFAULT_FEATURE_SETTINGS.postButtons,
    speechToComment: settings?.speechToComment ?? DEFAULT_FEATURE_SETTINGS.speechToComment,
  };
}

async function hasOffscreenDocument(): Promise<boolean> {
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

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
    justification: 'Authenticate the user with Firebase Google sign-in from an offscreen document.',
  });
}

async function persistFeatureSettingsToStorage(settings: UserFeatureSettings): Promise<void> {
  await chrome.storage.local.set({ [FEATURE_SETTINGS_STORAGE_KEY]: settings });
}

async function getStoredFeatureSettings(): Promise<UserFeatureSettings | null> {
  const result = await getStorageValue<{ [FEATURE_SETTINGS_STORAGE_KEY]?: Partial<UserFeatureSettings> }>([
    FEATURE_SETTINGS_STORAGE_KEY,
  ]);
  const stored = result[FEATURE_SETTINGS_STORAGE_KEY];
  return stored ? normalizeFeatureSettings(stored) : null;
}

async function closeOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

async function startOffscreenAuth(): Promise<OffscreenAuthResult> {
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

function formatUserInfo(user: {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
}) {
  return {
    isAuthenticated: true,
    userId: user.uid,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
  };
}

function getStorageValue<T>(keys: string | string[]): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result as T));
  });
}

function setStorageValue(value: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, () => resolve());
  });
}

function removeStorageValue(keys: string | string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

async function getStoredFeedsAuthTokens(): Promise<StoredFeedsAuthTokens | null> {
  const result = await getStorageValue<{ feedsAuthTokens?: StoredFeedsAuthTokens }>('feedsAuthTokens');
  return result.feedsAuthTokens || null;
}

async function setStoredFeedsAuthTokens(tokens: StoredFeedsAuthTokens): Promise<void> {
  await setStorageValue({ feedsAuthTokens: tokens });
}

async function clearStoredFeedsAuthTokens(): Promise<void> {
  await removeStorageValue('feedsAuthTokens');
}

async function rehydrateFeedsAuthFromStoredTokens(): Promise<User | null> {
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

async function getAuthenticatedFeedsUser(): Promise<User | null> {
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

function normalizeFeedsError(error: unknown, fallback = 'Something went wrong'): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : typeof error === 'string'
        ? error
        : '';

  const normalized = `${code} ${message}`.toLowerCase();

  console.warn('[feeds-error]', { code, message, normalized });

  if (
    normalized.includes('not authenticated') ||
    normalized.includes('unauthenticated') ||
    normalized.includes('auth/user-token-expired')
  ) {
    return 'Session expired, please sign in again.';
  }

  if (
    normalized.includes('permission-denied') ||
    normalized.includes('missing or insufficient permissions')
  ) {
    return 'Firestore permission denied. Make sure Firestore rules are deployed (firebase deploy --only firestore:rules).';
  }

  if (
    normalized.includes('auth/network-request-failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('network') ||
    normalized.includes('unavailable')
  ) {
    return 'Network error. Please try again.';
  }

  return message || fallback;
}

function getFeedsAuthErrorResponse<T extends Record<string, unknown>>(extra?: T): { success: false; error: string } & T {
  return {
    success: false,
    error: 'Session expired, please sign in again.',
    ...(extra || ({} as T)),
  };
}

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_AUTH_RESULT') {
    const pending = pendingOffscreenAuth;
    pendingOffscreenAuth = null;

    if (pending) {
      clearTimeout(pending.timeoutId);
      void closeOffscreenDocument();
      pending.resolve(message as OffscreenAuthResult);
    }

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

  if (message.type === 'FEEDS_GET_ALL') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          console.warn('[feeds] FEEDS_GET_ALL: no authenticated user');
          sendResponse(getFeedsAuthErrorResponse({ feeds: null }));
          return;
        }

        console.log('[feeds] FEEDS_GET_ALL: fetching feeds for uid:', user.uid);
        return getFeeds(user.uid)
          .then((feeds) => {
            console.log('[feeds] FEEDS_GET_ALL: got', feeds.length, 'feeds');
            sendResponse({
              success: true,
              feeds: feeds.map((f) => ({
                id: f.id,
                name: f.name,
                description: f.description,
                color: f.color,
                memberCount: f.memberCount,
                sortOrder: f.sortOrder,
              })),
            });
          });
      })
      .catch((error) => {
        console.error('[feeds] FEEDS_GET_ALL error:', error);
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to load feeds'),
          feeds: null,
        });
      });
    return true;
  }

  if (message.type === 'FEEDS_CREATE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return createFeed(user.uid, message.name, message.description, message.color)
          .then((feed) => {
            sendResponse({
              success: true,
              feed: {
                id: feed.id,
                name: feed.name,
                color: feed.color,
                memberCount: 0,
                sortOrder: feed.sortOrder,
              },
            });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to create feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_ADD_MEMBER') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        const profileData: LinkedInProfileData = message.profileData;
        return addMemberToFeed((message.ownerId as string) || user.uid, message.feedId, profileData)
          .then(({ member, alreadyExists }) => {
            sendResponse({ success: true, member, alreadyExists });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to add member') });
      });
    return true;
  }

  if (message.type === 'FEEDS_REMOVE_MEMBER') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return removeMemberFromFeed((message.ownerId as string) || user.uid, message.feedId, message.memberId)
          .then(() => {
            sendResponse({ success: true });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to remove member') });
      });
    return true;
  }

  if (message.type === 'FEEDS_UPDATE_MEMBER') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return updateMemberInFeed((message.ownerId as string) || user.uid, message.feedId, message.memberId, message.updates)
          .then(() => {
            sendResponse({ success: true });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to update member') });
      });
    return true;
  }

  if (message.type === 'FEEDS_GET_MEMBERS') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ members: [] }));
          return;
        }

        return getFeedMembers((message.ownerId as string) || user.uid, message.feedId)
          .then((members) => {
            sendResponse({ success: true, members });
          });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to load members'),
          members: [],
        });
      });
    return true;
  }

  if (message.type === 'FEEDS_GET_PROFILE_MEMBERSHIPS') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse({ memberships: [] });
          return;
        }
        return getProfileFeedMemberships(
          user.uid,
          message.linkedinUsername as string,
          message.linkedinUrl as string | undefined,
          message.memberNumericId as string | undefined,
          message.profileUrn as string | undefined
        )
          .then((memberships) => {
            sendResponse({ memberships });
          });
      })
      .catch(() => {
        sendResponse({ memberships: [] });
      });
    return true;
  }

  if (message.type === 'FEEDS_DELETE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return deleteFeed(user.uid, message.feedId)
          .then(() => {
            sendResponse({ success: true });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to delete feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_UPDATE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return updateFeed(user.uid, message.feedId, message.updates)
          .then(() => {
            sendResponse({ success: true });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to update feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_REORDER') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return reorderFeeds(user.uid, (message.feedIds as string[]) || [])
          .then(() => {
            sendResponse({ success: true });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to reorder feeds') });
      });
    return true;
  }

  if (message.type === 'FEEDS_GET_SHARED_ALL') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ sharedFeeds: [] }));
          return;
        }
        return getFollowedFeeds(user.uid)
          .then((sharedFeeds) => {
            sendResponse({ success: true, sharedFeeds });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to load shared feeds'), sharedFeeds: [] });
      });
    return true;
  }

  if (message.type === 'FEEDS_GET_SHARES') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ shares: [] }));
          return;
        }
        return getFeedShares(user.uid, message.feedId)
          .then((shares) => {
            sendResponse({ success: true, shares });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to load shares'), shares: [] });
      });
    return true;
  }

  if (message.type === 'FEEDS_SHARE_WITH_EMAIL') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return shareFeedWithUser(user.uid, message.feedId, message.email, message.role)
          .then((share) => {
            sendResponse({ success: true, share });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to share feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_UPDATE_SHARE_ROLE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return updateFeedShareRole(user.uid, message.feedId, message.targetUid, message.role)
          .then(() => {
            sendResponse({ success: true });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to update share role') });
      });
    return true;
  }

  if (message.type === 'FEEDS_REMOVE_SHARE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return removeFeedShare(user.uid, message.feedId, message.targetUid)
          .then(() => {
            sendResponse({ success: true });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to remove shared user') });
      });
    return true;
  }

  if (message.type === 'FEEDS_GET_SHARE_LINK') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return ensureFeedShareLink(user.uid, message.feedId)
          .then((token) => {
            sendResponse({
              success: true,
              token,
              // Hash survives LinkedIn redirects; ?sharefeed= is often stripped from the URL bar
              url: `https://www.linkedin.com/feed/#sharefeed=${encodeURIComponent(token)}`,
            });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to generate share link') });
      });
    return true;
  }

  if (message.type === 'FEEDS_FOLLOW_SHARE_LINK') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return followFeedByShareToken(user.uid, message.token)
          .then((sharedFeed) => {
            sendResponse({ success: true, sharedFeed });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to follow shared feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_UNFOLLOW_SHARED') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return unfollowFeed(user.uid, message.ownerId, message.feedId)
          .then(() => {
            sendResponse({ success: true });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to unfollow shared feed') });
      });
    return true;
  }

  if (message.type === 'FEEDS_DUPLICATE_SHARED') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }
        return duplicateSharedFeed(user.uid, message.ownerId, message.feedId)
          .then((feed) => {
            sendResponse({
              success: true,
              feed: {
                id: feed.id,
                name: feed.name,
                description: feed.description,
                color: feed.color,
                memberCount: feed.memberCount,
                sortOrder: feed.sortOrder,
              },
            });
          });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to duplicate shared feed') });
      });
    return true;
  }

  return false;
});

