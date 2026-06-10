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
  getProfileViewers,
  upsertProfileViewers,
  shareFeedWithUser,
  unfollowFeed,
  removeFeedShare,
  updateFeedShareRole,
  updateUserFeatureSettings,
} from 'shared/firestore-service';
import type { LinkedInProfileData, ProfileViewerInput, UserFeatureSettings } from 'shared/types';
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
const PROFILE_VIEWERS_ALARM_NAME = 'profile-viewers-sync';
const PROFILE_VIEWERS_SYNC_PERIOD_MINUTES = 24 * 60;
const PROFILE_VIEWERS_URL = 'https://www.linkedin.com/me/profile-views?skipRedirect=true';

const DEFAULT_FEATURE_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value: string): string {
  return normalizeText(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function getHtmlAttribute(html: string, attributeName: string): string {
  const escapedAttribute = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`\\b${escapedAttribute}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return normalizeText(match?.[2] || match?.[3] || match?.[4] || '');
}

function normalizeLinkedInProfileUrl(rawHref: string): { linkedinUrl: string; linkedinUsername: string } | null {
  try {
    const url = new URL(decodeHtmlEntities(rawHref), 'https://www.linkedin.com');
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      return null;
    }

    const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
    if (!match?.[1]) {
      return null;
    }

    const linkedinUsername = decodeURIComponent(match[1]).trim().toLowerCase();
    if (!linkedinUsername) {
      return null;
    }

    return {
      linkedinUsername,
      linkedinUrl: `https://www.linkedin.com/in/${encodeURIComponent(linkedinUsername)}/`,
    };
  } catch {
    return null;
  }
}

function extractProfileViewerFromAnchor(rawHref: string, anchorHtml: string): ProfileViewerInput | null {
  const normalizedProfile = normalizeLinkedInProfileUrl(rawHref);
  if (!normalizedProfile) {
    return null;
  }

  const imageMatch = anchorHtml.match(/<img\b[^>]*>/i);
  const svgLabelMatch = anchorHtml.match(/<svg\b[^>]*\baria-label\s*=\s*("([^"]*)"|'([^']*)')/i);
  const displayName = normalizeText(
    (imageMatch ? getHtmlAttribute(imageMatch[0], 'alt') : '') ||
      svgLabelMatch?.[2] ||
      svgLabelMatch?.[3] ||
      ''
  );

  if (!displayName) {
    return null;
  }

  const text = stripHtml(anchorHtml);
  const viewedAgoText = normalizeText(text.match(/Viewed\s+[^.]*?\bago\b/i)?.[0] || '');
  const mutualConnectionsText = normalizeText(text.match(/\d+\s+mutual\s+connections?/i)?.[0] || '');
  const connectionDegree = normalizeText(text.match(/[•\u2022]\s*(1st|2nd|3rd|\d+th)/i)?.[1] || '');
  const profileImageUrl = imageMatch ? getHtmlAttribute(imageMatch[0], 'src') : '';

  let headline = text;
  [displayName, viewedAgoText, mutualConnectionsText, 'Connect', 'Message', 'Follow'].forEach((part) => {
    if (part) {
      headline = headline.replace(part, ' ');
    }
  });
  headline = normalizeText(headline.replace(/[•\u2022]\s*(1st|2nd|3rd|\d+th)/gi, ' '));

  return {
    ...normalizedProfile,
    displayName,
    headline,
    profileImageUrl,
    connectionDegree,
    viewedAgoText,
    mutualConnectionsText,
  };
}

function parseVisibleProfileViewers(html: string): ProfileViewerInput[] {
  const viewers: ProfileViewerInput[] = [];
  const seenUsernames = new Set<string>();
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) && viewers.length < 3) {
    const href = match[2] || match[3] || match[4] || '';
    const viewer = extractProfileViewerFromAnchor(href, match[5] || '');
    if (!viewer || seenUsernames.has(viewer.linkedinUsername)) {
      continue;
    }

    seenUsernames.add(viewer.linkedinUsername);
    viewers.push(viewer);
  }

  return viewers;
}

function waitForTabComplete(tabId: number, timeoutMs = 25_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Timed out waiting for LinkedIn profile viewers tab to load'));
    }, timeoutMs);

    const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
        return;
      }

      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (tab.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    });
  });
}

async function scrapeProfileViewersFromPageDom(): Promise<ProfileViewerInput[]> {
  function normalizeText(value: string): string {
    return (value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
  }

  function normalizeProfileUrl(rawHref: string): { linkedinUrl: string; linkedinUsername: string } | null {
    try {
      const url = new URL(rawHref, 'https://www.linkedin.com');
      const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
      if (!match?.[1]) {
        return null;
      }

      const linkedinUsername = decodeURIComponent(match[1]).trim().toLowerCase();
      if (!linkedinUsername) {
        return null;
      }

      return {
        linkedinUsername,
        linkedinUrl: `https://www.linkedin.com/in/${encodeURIComponent(linkedinUsername)}/`,
      };
    } catch {
      return null;
    }
  }

  function collect(): ProfileViewerInput[] {
    const viewers: ProfileViewerInput[] = [];
    const seenUsernames = new Set<string>();
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'));

    for (const anchor of anchors) {
      if (viewers.length >= 3) {
        break;
      }

      const profile = normalizeProfileUrl(anchor.href);
      if (!profile || seenUsernames.has(profile.linkedinUsername)) {
        continue;
      }

      const rowText = normalizeText(anchor.innerText || anchor.textContent || '');
      const viewedAgoText = normalizeText(rowText.match(/Viewed\s+.+?\sago/i)?.[0] || '');
      if (!viewedAgoText) {
        continue;
      }

      const image = anchor.querySelector<HTMLImageElement>('img[alt]');
      const svgWithLabel = anchor.querySelector<SVGElement>('svg[aria-label]');
      const displayName = normalizeText(image?.alt || svgWithLabel?.getAttribute('aria-label') || '');
      if (!displayName) {
        continue;
      }

      const mutualConnectionsText = normalizeText(rowText.match(/\d+\s+mutual\s+connections?/i)?.[0] || '');
      const connectionDegree = normalizeText(rowText.match(/[•\u2022]\s*(1st|2nd|3rd|\d+th)/i)?.[1] || '');
      let headline = rowText;
      [displayName, viewedAgoText, mutualConnectionsText, 'Connect', 'Message', 'Follow'].forEach((part) => {
        if (part) {
          headline = headline.replace(part, ' ');
        }
      });
      headline = normalizeText(headline.replace(/[•\u2022]\s*(1st|2nd|3rd|\d+th)/gi, ' '));

      seenUsernames.add(profile.linkedinUsername);
      viewers.push({
        ...profile,
        displayName,
        headline,
        profileImageUrl: image?.src || '',
        connectionDegree,
        viewedAgoText,
        mutualConnectionsText,
      });
    }

    return viewers;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 12_000) {
    const viewers = collect();
    if (viewers.length > 0) {
      return viewers;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return collect();
}

async function scrapeProfileViewersFromInactiveTab(): Promise<ProfileViewerInput[]> {
  const tab = await chrome.tabs.create({
    url: PROFILE_VIEWERS_URL,
    active: false,
  });

  if (!tab.id) {
    return [];
  }

  try {
    await waitForTabComplete(tab.id);
    const [executionResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeProfileViewersFromPageDom,
    });

    return Array.isArray(executionResult?.result) ? (executionResult.result as ProfileViewerInput[]) : [];
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {
      /* ignore cleanup failures */
    });
  }
}

async function syncProfileViewers(): Promise<{ savedCount: number; newCount: number; visibleCount: number }> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    return { savedCount: 0, newCount: 0, visibleCount: 0 };
  }

  const response = await fetch(PROFILE_VIEWERS_URL, {
    credentials: 'include',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`LinkedIn profile viewers request failed with ${response.status}`);
  }

  const html = await response.text();
  const visibleViewers = parseVisibleProfileViewers(html);
  const viewersToSave = visibleViewers.length > 0 ? visibleViewers : await scrapeProfileViewersFromInactiveTab();
  const result = await upsertProfileViewers(user.uid, viewersToSave);
  return {
    ...result,
    visibleCount: viewersToSave.length,
  };
}

function scheduleProfileViewersSync(): void {
  if (!chrome.alarms?.create) {
    return;
  }

  chrome.alarms.create(PROFILE_VIEWERS_ALARM_NAME, {
    periodInMinutes: PROFILE_VIEWERS_SYNC_PERIOD_MINUTES,
    delayInMinutes: PROFILE_VIEWERS_SYNC_PERIOD_MINUTES,
  });
}

function ensureProfileViewersSyncSchedule(): void {
  if (!chrome.alarms?.get) {
    return;
  }

  chrome.alarms.get(PROFILE_VIEWERS_ALARM_NAME).then((alarm) => {
    if (alarm?.periodInMinutes === PROFILE_VIEWERS_SYNC_PERIOD_MINUTES) {
      return;
    }

    scheduleProfileViewersSync();
  });
}

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

chrome.runtime.onInstalled.addListener(() => {
  scheduleProfileViewersSync();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleProfileViewersSync();
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name !== PROFILE_VIEWERS_ALARM_NAME) {
    return;
  }

  syncProfileViewers().catch((error) => {
    console.warn('[profile-viewers] Background sync failed:', error);
  });
});

ensureProfileViewersSyncSchedule();

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
        scheduleProfileViewersSync();
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

  if (message.type === 'PROFILE_VIEWERS_GET') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ viewers: [] }));
          return;
        }

        return getProfileViewers(user.uid).then((viewers) => {
          sendResponse({ success: true, viewers });
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to load profile visitors'),
          viewers: [],
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_SYNC_NOW') {
    syncProfileViewers()
      .then((result) => {
        sendResponse({ success: true, ...result });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to sync profile visitors'),
          savedCount: 0,
          newCount: 0,
          visibleCount: 0,
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

