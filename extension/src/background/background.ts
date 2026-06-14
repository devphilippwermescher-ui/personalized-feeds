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
  getProfileViewerItems,
  getProfileViewerSearches,
  getProfileViewerSummary,
  getProfileViewers,
  removeProfileViewer,
  upsertProfileViewerSearches,
  upsertProfileViewers,
  updateProfileViewerSummary,
  updateProfileViewer,
  shareFeedWithUser,
  unfollowFeed,
  removeFeedShare,
  updateFeedShareRole,
  updateUserFeatureSettings,
} from 'shared/firestore-service';
import type {
  LinkedInProfileData,
  ProfileViewer,
  ProfileViewerInput,
  ProfileViewerSearchInput,
  UserFeatureSettings,
} from 'shared/types';
import type { User } from 'firebase/auth';
import {
  completeProfileViewersSyncFailure,
  completeProfileViewersSyncSuccess,
  canMakeProfileViewersRequest,
  createProfileViewersSyncState,
  decideProfileViewersSync,
  getNextProfileViewersAlarmAt,
  getProfileViewersAuthRecoveryPlan,
  getProfileViewersRateLimitResetAt,
  getProfileViewersScheduledIntervalMs,
  recordProfileViewersRequest,
  startProfileViewersSyncAttempt,
  type ProfileViewersSyncErrorCode,
  type ProfileViewersSyncLog,
  type ProfileViewersSyncRunType,
  type ProfileViewersSyncState,
  type ProfileViewersSyncTrigger,
} from './profile-viewers-sync-state';
import { mergeProfileViewerCandidates } from './profile-viewers-parser-merge';
import { extractProfileViewerReferences } from './profile-viewers-references';
import {
  mergeProfileViewerWithPageMetadata,
  parseProfileViewerPageMetadata,
} from './profile-viewers-enrichment';
import {
  findLinkedInPeopleSearchResultByUsername,
  type LinkedInPeopleSearchResult,
} from 'shared/linkedin-people-search';
import {
  chooseProfileViewerDisplayName,
  getAmbiguousProfileViewerImageUrls,
  humanizeLinkedInUsername,
  isUsableLinkedInProfileImageUrl,
} from 'shared/profile-viewer-quality';
import { fetchWithTimeout } from './fetch-with-timeout';
import { validateProfileViewersRscPayload } from './profile-viewers-response';
import {
  hasCompleteProfileViewerIdentity,
  mapWithConcurrency,
  profileViewerNeedsEnrichment,
} from './profile-viewers-enrichment-policy';
import { extractProfileViewerImageUrls } from './profile-viewers-rsc-images';
import {
  createProfileViewersPaginationBody,
  createRecentProfileViewerSnapshot,
  extendBackfillRecentProfileViewerSnapshot,
  extractNextProfileViewersPaginationCursor,
  PROFILE_VIEWERS_MAX_PAGES_PER_SYNC,
  PROFILE_VIEWERS_PAGER_ID,
  PROFILE_VIEWERS_RECENT_SNAPSHOT_LIMIT,
  shouldStopIncrementalProfileViewerPagination,
  type ProfileViewersPaginationCursor,
} from './profile-viewers-pagination';
import { extractProfileViewerSearches } from './profile-viewer-searches';
import { extractPrivateProfileViewerCount } from './profile-viewer-private-count';
import { isValidLinkedInProfileUsername } from 'shared/linkedin-identity';

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
const PROFILE_VIEWERS_SYNC_STORAGE_KEY = 'pf_profile_viewers_sync';
const PROFILE_VIEWERS_SYNC_LOG_LIMIT = 50;
const PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY = 'pf_profile_viewers_wake_events';
const PROFILE_VIEWERS_WAKE_LOG_LIMIT = 1000;
const PROFILE_VIEWERS_SYNC_LOG_USERNAME_LIMIT = 50;
const PROFILE_VIEWERS_RSC_TIMEOUT_MS = 20_000;
const PROFILE_VIEWERS_PEOPLE_SEARCH_TIMEOUT_MS = 10_000;
const PROFILE_VIEWERS_PROFILE_PAGE_TIMEOUT_MS = 15_000;
const PROFILE_VIEWERS_ENRICHMENT_CONCURRENCY = 2;
const PROFILE_VIEWERS_URL = 'https://www.linkedin.com/me/profile-views?skipRedirect=true';
const PROFILE_VIEWERS_RSC_URL = 'https://www.linkedin.com/flagship-web/rsc-action/actions/server-request?sduiid=WvmpEntityList';
const PROFILE_VIEWERS_PAGINATION_URL =
  `https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=` +
  encodeURIComponent(PROFILE_VIEWERS_PAGER_ID);
const PROFILE_VIEWERS_RSC_BODY = JSON.stringify({
  requestId: 'WvmpEntityList',
  serverRequest: {
    requestId: 'WvmpEntityList',
    requestedArguments: {
      $type: 'proto.sdui.actions.requests.RequestedArguments',
      payload: {
        sortType: 'ProfileViewSortType_TIME_DESCENDING',
        filterTypeList: [],
      },
      requestedStateKeys: [],
      requestMetadata: {
        $type: 'proto.sdui.common.RequestMetadata',
      },
    },
    isApfcEnabled: false,
    isStreaming: false,
    rumPageKey: '',
  },
  states: [],
  requestedArguments: {
    $type: 'proto.sdui.actions.requests.RequestedArguments',
    payload: {
      sortType: 'ProfileViewSortType_TIME_DESCENDING',
      filterTypeList: [],
    },
    requestedStateKeys: [],
    requestMetadata: {
      $type: 'proto.sdui.common.RequestMetadata',
    },
    states: [],
    screenId: 'com.linkedin.sdui.flagshipnav.home.Home',
  },
});

const DEFAULT_FEATURE_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
  hideProfileViewers: false,
};

class ProfileViewersSyncError extends Error {
  constructor(
    message: string,
    readonly code: ProfileViewersSyncErrorCode,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = 'ProfileViewersSyncError';
  }
}

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

function normalizeLinkedInPayloadText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u002D/gi, '-')
    .replace(/\\u200b/gi, '');
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
    if (!isValidLinkedInProfileUsername(linkedinUsername)) {
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

function extractProfileViewerFromAnchor(
  rawHref: string,
  anchorHtml: string,
  sourceIndex?: number
): ProfileViewerInput | null {
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
  const profileImageUrl = imageMatch
    ? [
        getHtmlAttribute(imageMatch[0], 'src'),
        getHtmlAttribute(imageMatch[0], 'data-delayed-url'),
        getHtmlAttribute(imageMatch[0], 'data-src'),
        getHtmlAttribute(imageMatch[0], 'data-li-src'),
        getHtmlAttribute(imageMatch[0], 'srcset').split(/\s+/)[0] || '',
      ]
        .map((value) => normalizeLinkedInPayloadText(value))
        .find((value) => /^https:\/\/media\.licdn\.com\//i.test(value)) || ''
    : '';

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
    sourceIndex,
  };
}

function parseVisibleProfileViewers(html: string): ProfileViewerInput[] {
  const viewers: ProfileViewerInput[] = [];
  const seenUsernames = new Set<string>();
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const href = match[2] || match[3] || match[4] || '';
    const viewer = extractProfileViewerFromAnchor(href, match[5] || '', match.index);
    if (!viewer || seenUsernames.has(viewer.linkedinUsername)) {
      continue;
    }

    seenUsernames.add(viewer.linkedinUsername);
    viewers.push(viewer);
  }

  return viewers;
}

function extractQuotedStrings(value: string): string[] {
  const strings: string[] = [];
  const seen = new Set<string>();
  const quotedPattern = /"((?:\\.|[^"\\])*)"/g;

  let match: RegExpExecArray | null;
  while ((match = quotedPattern.exec(value))) {
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (typeof parsed !== 'string') {
        continue;
      }

      const normalized = normalizeText(normalizeLinkedInPayloadText(parsed));
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      strings.push(normalized);
    } catch {
      /* Ignore non-JSON string fragments from streamed RSC payloads. */
    }
  }

  return strings;
}

function scoreProfileSlugMatch(value: string, linkedinUsername: string): number {
  const normalizedValue = value.toLowerCase();
  return linkedinUsername
    .split(/[-_]+/)
    .filter((part) => part.length > 2 && !/^\d+$/.test(part))
    .reduce((score, part) => score + (normalizedValue.includes(part) ? 1 : 0), 0);
}

function isTechnicalLinkedInString(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    value.length > 220 ||
    /^(offsetstart|offsetend|start|end|length|text|attributes|entityurn|navigationurl)$/i.test(value) ||
    /^\d+(?:\.\d+)?x$/i.test(value) ||
    /^-?\d+(?:\.\d+)?$/.test(value) ||
    /^https?:\/\//i.test(value) ||
    lower.includes('linkedin.com') ||
    lower.includes('urn:li:') ||
    lower.includes('proto.') ||
    lower.includes('profileview') ||
    lower.includes('wvmp') ||
    lower.includes('state:') ||
    lower.includes('binding') ||
    lower.includes('tracking') ||
    lower.includes('connect-button-disabled') ||
    lower.includes('profile-displayphoto') ||
    lower.includes('profile-framedphoto')
  );
}

function isProfileViewerUiText(value: string): boolean {
  return /^(connect|message|follow|view profile|1st|2nd|3rd|\d+th)$/i.test(value);
}

function isLikelyProfileHeadline(value: string, displayName: string, linkedinUsername: string): boolean {
  if (
    value === displayName ||
    value.length < 4 ||
    isTechnicalLinkedInString(value) ||
    isProfileViewerUiText(value) ||
    /viewed\s+.+?\sago/i.test(value) ||
    /\d+\s+mutual\s+connections?/i.test(value) ||
    scoreProfileSlugMatch(value, linkedinUsername) >= 2
  ) {
    return false;
  }

  return /\p{L}/u.test(value) && (/\s|[|/\\,.-]/.test(value) || value.length > 10);
}

function pickDisplayNameFromStrings(strings: string[], linkedinUsername: string): string {
  let bestName = '';
  let bestScore = 0;

  strings.forEach((value) => {
    if (isTechnicalLinkedInString(value) || isProfileViewerUiText(value) || /viewed\s+.+?\sago/i.test(value)) {
      return;
    }

    const score = scoreProfileSlugMatch(value, linkedinUsername);
    if (score > bestScore || (score === bestScore && score > 0 && value.length < bestName.length)) {
      bestName = value;
      bestScore = score;
    }
  });

  return bestScore > 0 ? bestName : '';
}

function pickHeadlineFromStrings(strings: string[], displayName: string, linkedinUsername: string): string {
  const displayNameIndex = strings.findIndex((value) => value === displayName);
  const candidates = displayNameIndex >= 0 ? strings.slice(displayNameIndex + 1) : strings;

  return candidates.find((value) => isLikelyProfileHeadline(value, displayName, linkedinUsername)) || '';
}

function parseProfileViewersFromRscPayload(payload: string): ProfileViewerInput[] {
  const normalizedPayload = normalizeLinkedInPayloadText(payload);
  const viewers: ProfileViewerInput[] = [];
  const seenUsernames = new Set<string>();
  const globalStrings = extractQuotedStrings(normalizedPayload);
  const imageUrlsByDisplayName = extractProfileViewerImageUrls(normalizedPayload);
  const references = extractProfileViewerReferences(normalizedPayload);

  for (const profile of references) {
    if (seenUsernames.has(profile.linkedinUsername)) {
      continue;
    }

    const referenceContextStart = Math.max(0, profile.index - 12_000);
    const referenceContextEnd = Math.min(normalizedPayload.length, profile.index + 12_000);
    const referenceContext = normalizedPayload.slice(referenceContextStart, referenceContextEnd);
    const referenceStrings = extractQuotedStrings(referenceContext);
    const displayNameCandidate =
      pickDisplayNameFromStrings(referenceStrings, profile.linkedinUsername) ||
      pickDisplayNameFromStrings(globalStrings, profile.linkedinUsername) ||
      humanizeLinkedInUsername(profile.linkedinUsername);
    const displayName = chooseProfileViewerDisplayName(
      displayNameCandidate,
      undefined,
      profile.linkedinUsername
    );
    const displayNameIndex = normalizedPayload.toLowerCase().indexOf(displayName.toLowerCase());
    const contextIndex = displayNameIndex >= 0 ? displayNameIndex : profile.index;
    const contextStart = Math.max(0, contextIndex - 12_000);
    const contextEnd = Math.min(normalizedPayload.length, contextIndex + 12_000);
    const context = normalizedPayload.slice(contextStart, contextEnd);
    const strings = extractQuotedStrings(context);

    const viewedAgoText = normalizeText(context.match(/Viewed\s+[^"'<\\]{1,80}?\sago/i)?.[0] || '');
    const mutualConnectionsText = normalizeText(context.match(/\d+\s+mutual\s+connections?/i)?.[0] || '');
    const connectionDegree = normalizeText(strings.find((value) => /^(1st|2nd|3rd|\d+th)$/i.test(value)) || '');
    seenUsernames.add(profile.linkedinUsername);
    viewers.push({
      ...profile,
      displayName,
      headline: pickHeadlineFromStrings(strings, displayName, profile.linkedinUsername),
      profileImageUrl: imageUrlsByDisplayName.get(displayName.toLowerCase()) || '',
      connectionDegree,
      viewedAgoText,
      mutualConnectionsText,
      sourceIndex: profile.index,
    });
  }

  return viewers;
}

function parseProfileViewersFromPayload(payload: string): ProfileViewerInput[] {
  const anchorViewers = parseVisibleProfileViewers(payload);
  const rscViewers = parseProfileViewersFromRscPayload(payload);
  return mergeProfileViewerCandidates([anchorViewers, rscViewers]);
}

function getChromeCookie(details: chrome.cookies.Details): Promise<chrome.cookies.Cookie | null> {
  if (!chrome.cookies?.get) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    chrome.cookies.get(details, (cookie) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(cookie || null);
    });
  });
}

async function getLinkedInCsrfToken(): Promise<string> {
  const jsessionId = await getChromeCookie({
    url: 'https://www.linkedin.com',
    name: 'JSESSIONID',
  });

  return (jsessionId?.value || '').replace(/^"|"$/g, '');
}

interface ProfileViewersRscPage {
  viewers: ProfileViewerInput[];
  searches: ProfileViewerSearchInput[];
  privateViewerCount: number | null;
  httpStatus: number;
  responseLength: number;
  nextCursor: ProfileViewersPaginationCursor | null;
}

async function fetchProfileViewersRscPage(
  url: string,
  body: string,
  csrfToken: string,
  allowPremiumPaginationProbe = false
): Promise<ProfileViewersRscPage> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: '*/*',
          'content-type': 'application/json',
          'csrf-token': csrfToken,
          'x-li-anchor-page-key': 'd_flagship3_leia_wvmp',
          'x-li-rsc-stream': 'true',
        },
        body,
      },
      PROFILE_VIEWERS_RSC_TIMEOUT_MS
    );
  } catch (error) {
    throw new ProfileViewersSyncError(
      error instanceof Error ? error.message : 'LinkedIn profile viewers API network request failed',
      'network_error'
    );
  }

  if (!response.ok) {
    const code: ProfileViewersSyncErrorCode =
      response.status === 401 || response.status === 403 ? 'linkedin_auth_required' : 'api_error';
    throw new ProfileViewersSyncError(
      `LinkedIn profile viewers API request failed with ${response.status}`,
      code,
      response.status
    );
  }

  const payload = await response.text();
  const validation = validateProfileViewersRscPayload(payload);
  if (!validation.valid) {
    throw new ProfileViewersSyncError(
      validation.reason,
      validation.authRequired ? 'linkedin_auth_required' : 'parse_error',
      response.status
    );
  }

  try {
    const viewers = parseProfileViewersFromPayload(payload);
    const searches = extractProfileViewerSearches(payload);
    const privateViewerCount = extractPrivateProfileViewerCount(payload);
    const orderedItems = [
      ...viewers.map((viewer) => ({
        type: 'profile' as const,
        sourceIndex: viewer.sourceIndex ?? Number.MAX_SAFE_INTEGER,
        value: viewer,
      })),
      ...searches.map((search) => ({
        type: 'search' as const,
        sourceIndex: search.sourceIndex ?? Number.MAX_SAFE_INTEGER,
        value: search,
      })),
    ].sort((left, right) => left.sourceIndex - right.sourceIndex);

    orderedItems.forEach((item, listPosition) => {
      item.value.listPosition = listPosition;
    });

    return {
      viewers,
      searches,
      privateViewerCount,
      httpStatus: response.status,
      responseLength: payload.length,
      nextCursor:
        extractNextProfileViewersPaginationCursor(payload) ||
        (allowPremiumPaginationProbe && viewers.length > 3
          ? { start: 10, count: 10 }
          : null),
    };
  } catch (error) {
    throw new ProfileViewersSyncError(
      error instanceof Error ? error.message : 'Failed to parse LinkedIn profile viewers response',
      'parse_error',
      response.status
    );
  }
}

async function fetchProfileViewersFromRsc(csrfToken: string): Promise<ProfileViewersRscPage> {
  return fetchProfileViewersRscPage(
    PROFILE_VIEWERS_RSC_URL,
    PROFILE_VIEWERS_RSC_BODY,
    csrfToken,
    true
  );
}

async function fetchProfileViewersPaginationPage(
  cursor: ProfileViewersPaginationCursor,
  csrfToken: string
): Promise<ProfileViewersRscPage> {
  return fetchProfileViewersRscPage(
    PROFILE_VIEWERS_PAGINATION_URL,
    createProfileViewersPaginationBody(cursor),
    csrfToken
  );
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
      const reservedUsernames = new Set(['me', 'null', 'undefined', 'profile', 'settings']);
      if (
        linkedinUsername.length < 3 ||
        reservedUsernames.has(linkedinUsername) ||
        !/^[\p{L}\p{N}_.~-]+$/u.test(linkedinUsername)
      ) {
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

interface ProfileViewersSyncResult {
  savedCount: number;
  newCount: number;
  searchSavedCount?: number;
  newSearchCount?: number;
  visibleCount: number;
  visibleSearchCount?: number;
  privateViewerCount?: number;
  updatedCount: number;
  visibleProfileUsernames: string[];
  newProfileUsernames: string[];
  httpStatus?: number;
  responseLength?: number;
  requestCount?: number;
  pagesFetched?: number;
  paginationComplete?: boolean;
  paginationMode?: 'backfill' | 'incremental';
}

interface ProfileViewerEnrichmentDiagnostic {
  linkedinUsername: string;
  parsedDisplayName: string;
  finalDisplayName: string;
  hadRscImage: boolean;
  hadPeopleSearchImage: boolean;
  hadProfilePageImage: boolean;
  hadExistingImage: boolean;
  ignoredDuplicateExistingImage: boolean;
  removedAmbiguousFinalImage: boolean;
  hasFinalImage: boolean;
  skippedEnrichment: boolean;
  profilePageStatus?: number;
}

async function fetchProfileViewerPeopleSearchMatch(
  viewer: ProfileViewerInput,
  csrfToken: string
): Promise<LinkedInPeopleSearchResult | null> {
  const targetUsername = viewer.linkedinUsername.trim().toLowerCase();
  const queries = Array.from(new Set([viewer.displayName.trim(), viewer.linkedinUsername.trim()].filter(Boolean)));

  for (const query of queries) {
    const variables = `(keywords:${encodeURIComponent(query)})`;
    const url =
      `https://www.linkedin.com/voyager/api/graphql?variables=${variables}` +
      '&queryId=voyagerSearchDashSharing.4e26d0f2284baec4fa3fe92c090494cd';

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            accept: 'application/vnd.linkedin.normalized+json+2.1',
            'csrf-token': csrfToken,
            'x-restli-protocol-version': '2.0.0',
          },
        },
        PROFILE_VIEWERS_PEOPLE_SEARCH_TIMEOUT_MS
      );
      if (!response.ok) {
        continue;
      }

      const exactMatch = findLinkedInPeopleSearchResultByUsername(await response.json(), targetUsername);
      if (exactMatch) {
        return exactMatch;
      }
    } catch (error) {
      console.warn(`[profile-viewers-sync] People search failed for ${viewer.linkedinUsername}:`, error);
    }
  }

  return null;
}

async function enrichProfileViewerFromProfilePage(
  viewer: ProfileViewerInput,
  existingViewer: Partial<ProfileViewer> | undefined,
  csrfToken: string,
  ignoredDuplicateExistingImage: boolean
): Promise<{
  viewer: ProfileViewerInput;
  diagnostic: ProfileViewerEnrichmentDiagnostic;
}> {
  const peopleSearchMatch = await fetchProfileViewerPeopleSearchMatch(viewer, csrfToken);
  const peopleSearchImageUrl = isUsableLinkedInProfileImageUrl(peopleSearchMatch?.profileImageUrl)
    ? peopleSearchMatch.profileImageUrl
    : '';
  const viewerWithTrustedData: ProfileViewerInput = {
    ...viewer,
    displayName: peopleSearchMatch?.displayName || viewer.displayName,
    headline: peopleSearchMatch?.headline || viewer.headline,
    connectionDegree: peopleSearchMatch?.connectionDegree || viewer.connectionDegree,
    profileImageUrl: peopleSearchImageUrl,
  };
  const createResult = (
    enrichedViewer: ProfileViewerInput,
    profilePageStatus?: number,
    hadProfilePageImage = false
  ) => ({
    viewer: enrichedViewer,
    diagnostic: {
      linkedinUsername: viewer.linkedinUsername,
      parsedDisplayName: viewer.displayName,
      finalDisplayName: enrichedViewer.displayName,
      hadRscImage: Boolean(viewer.profileImageUrl),
      hadPeopleSearchImage: Boolean(peopleSearchImageUrl),
      hadProfilePageImage,
      hadExistingImage: Boolean(existingViewer?.profileImageUrl),
      ignoredDuplicateExistingImage,
      removedAmbiguousFinalImage: false,
      hasFinalImage: Boolean(enrichedViewer.profileImageUrl),
      skippedEnrichment: false,
      profilePageStatus,
    },
  });

  const viewerAfterPeopleSearch = mergeProfileViewerWithPageMetadata(
    viewerWithTrustedData,
    { displayName: '', profileImageUrl: '' },
    existingViewer
  );
  if (hasCompleteProfileViewerIdentity(viewerAfterPeopleSearch)) {
    return createResult(viewerAfterPeopleSearch);
  }

  try {
    const response = await fetchWithTimeout(
      viewer.linkedinUrl,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      PROFILE_VIEWERS_PROFILE_PAGE_TIMEOUT_MS
    );

    if (!response.ok) {
      return createResult(
        mergeProfileViewerWithPageMetadata(
          viewerWithTrustedData,
          { displayName: '', profileImageUrl: '' },
          existingViewer
        ),
        response.status
      );
    }

    const metadata = parseProfileViewerPageMetadata(await response.text());
    return createResult(
      mergeProfileViewerWithPageMetadata(viewerWithTrustedData, metadata, existingViewer),
      response.status,
      Boolean(metadata.profileImageUrl)
    );
  } catch (error) {
    console.warn(`[profile-viewers-sync] Profile enrichment failed for ${viewer.linkedinUsername}:`, error);
    return createResult(
      mergeProfileViewerWithPageMetadata(
        viewerWithTrustedData,
        { displayName: '', profileImageUrl: '' },
        existingViewer
      )
    );
  }
}

async function enrichVisibleProfileViewers(
  viewers: ProfileViewerInput[],
  existingViewers: ProfileViewer[]
): Promise<{
  viewers: ProfileViewerInput[];
  diagnostics: ProfileViewerEnrichmentDiagnostic[];
}> {
  if (viewers.length === 0) {
    return { viewers: [], diagnostics: [] };
  }

  const existingByUsername = new Map(existingViewers.map((viewer) => [viewer.linkedinUsername.toLowerCase(), viewer]));
  const ambiguousExistingImages = getAmbiguousProfileViewerImageUrls(existingViewers);
  const csrfToken = await getLinkedInCsrfToken();
  const enrichments = await mapWithConcurrency(viewers, PROFILE_VIEWERS_ENRICHMENT_CONCURRENCY, async (viewer) => {
    const storedViewer = existingByUsername.get(viewer.linkedinUsername.toLowerCase());
    const existingImageUrl = storedViewer?.profileImageUrl?.trim() || '';
    const ignoredDuplicateExistingImage = ambiguousExistingImages.has(existingImageUrl);
    const existingViewer = storedViewer
      ? {
          ...storedViewer,
          profileImageUrl: ignoredDuplicateExistingImage ? '' : storedViewer.profileImageUrl,
        }
      : undefined;

    if (!profileViewerNeedsEnrichment(viewer, storedViewer, ignoredDuplicateExistingImage)) {
      const mergedViewer = mergeProfileViewerWithPageMetadata(
        viewer,
        { displayName: '', profileImageUrl: '' },
        existingViewer
      );
      return {
        viewer: mergedViewer,
        diagnostic: {
          linkedinUsername: viewer.linkedinUsername,
          parsedDisplayName: viewer.displayName,
          finalDisplayName: mergedViewer.displayName,
          hadRscImage: Boolean(viewer.profileImageUrl),
          hadPeopleSearchImage: false,
          hadProfilePageImage: false,
          hadExistingImage: Boolean(existingViewer?.profileImageUrl),
          ignoredDuplicateExistingImage,
          removedAmbiguousFinalImage: false,
          hasFinalImage: Boolean(mergedViewer.profileImageUrl),
          skippedEnrichment: true,
        },
      };
    }

    return enrichProfileViewerFromProfilePage(viewer, existingViewer, csrfToken, ignoredDuplicateExistingImage);
  });
  const enrichedViewers = enrichments.map((enrichment) => enrichment.viewer);
  const diagnostics = enrichments.map((enrichment) => enrichment.diagnostic);

  const ambiguousFinalImages = getAmbiguousProfileViewerImageUrls(enrichedViewers);
  enrichedViewers.forEach((viewer, index) => {
    if (!ambiguousFinalImages.has(viewer.profileImageUrl?.trim() || '')) {
      return;
    }

    enrichedViewers[index] = {
      ...viewer,
      profileImageUrl: '',
    };
    diagnostics[index] = {
      ...diagnostics[index],
      removedAmbiguousFinalImage: true,
      hasFinalImage: false,
    };
  });

  return {
    viewers: enrichedViewers,
    diagnostics,
  };
}

function updateExistingProfileViewerSnapshot(
  existingByUsername: Map<string, ProfileViewer>,
  viewers: ProfileViewerInput[],
  seenAt: number,
  positionOffset: number
): void {
  viewers.forEach((viewer, index) => {
    const username = viewer.linkedinUsername.toLowerCase();
    const existing = existingByUsername.get(username);
    const mergedViewer = mergeProfileViewerWithPageMetadata(
      viewer,
      { displayName: '', profileImageUrl: '' },
      existing
    );

    existingByUsername.set(username, {
      ...existing,
      ...mergedViewer,
      id: username,
      linkedinUsername: username,
      firstSeenAt: existing?.firstSeenAt || seenAt,
      lastSeenAt: seenAt,
      lastSeenPosition: positionOffset + index,
      source: 'linkedin_profile_views',
    });
  });
}

async function syncProfileViewersViaApi(
  authenticatedUser: User | undefined,
  initialSyncState: ProfileViewersSyncState,
  persistSyncProgress: (state: ProfileViewersSyncState) => Promise<void>
): Promise<ProfileViewersSyncResult> {
  const user = authenticatedUser || (await getAuthenticatedFeedsUser());
  if (!user) {
    throw new ProfileViewersSyncError(
      'myFeedPilot authentication is required before profile visitors can be saved.',
      'app_auth_required'
    );
  }

  const [existingViewers, existingSearches] = await Promise.all([
    getProfileViewers(user.uid),
    getProfileViewerSearches(user.uid),
  ]);
  const existingByUsername = new Map(
    existingViewers.map((viewer) => [viewer.linkedinUsername.toLowerCase(), viewer])
  );
  const existingSearchesByKey = new Map(
    existingSearches.map((search) => [search.searchKey, search])
  );
  const existingUsernames = new Set(existingByUsername.keys());
  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new ProfileViewersSyncError(
      'LinkedIn CSRF token is unavailable. Make sure you are signed in to LinkedIn.',
      'linkedin_auth_required'
    );
  }

  let syncState = initialSyncState;
  const paginationMode = syncState.backfillStatus === 'complete' ? 'incremental' : 'backfill';
  const syncSeenAt =
    paginationMode === 'backfill'
      ? syncState.backfillStartedAt || Date.now()
      : Date.now();
  const collectedViewers: ProfileViewerInput[] = [];
  const collectedSearches = new Map<string, ProfileViewerSearchInput>();
  const newProfileUsernames: string[] = [];
  const visitedCursors = new Set<number>();
  let requestCount = 0;
  let pagesFetched = 0;
  let savedCount = 0;
  let newCount = 0;
  let searchSavedCount = 0;
  let newSearchCount = 0;
  let privateViewerCount: number | undefined;
  let responseLength = 0;
  let httpStatus = 200;
  let cursor: ProfileViewersPaginationCursor | null =
    paginationMode === 'backfill' &&
    syncState.backfillStatus === 'in_progress' &&
    typeof syncState.backfillNextStart === 'number'
      ? {
          start: syncState.backfillNextStart,
          count: syncState.backfillPageSize || 10,
        }
      : null;
  let page =
    cursor === null
      ? await fetchProfileViewersFromRsc(csrfToken)
      : await fetchProfileViewersPaginationPage(cursor, csrfToken);
  let positionOffset = cursor?.start || 0;
  if (cursor) {
    visitedCursors.add(cursor.start);
  }
  let consecutivePagesWithoutNewProfiles = 0;
  let paginationComplete = false;

  while (true) {
    requestCount += 1;
    pagesFetched += 1;
    responseLength += page.responseLength;
    httpStatus = page.httpStatus;

    const existingSnapshot = Array.from(existingByUsername.values());
    const enrichment = await enrichVisibleProfileViewers(page.viewers, existingSnapshot);
    const pageViewers = enrichment.viewers;
    const pageHasNewProfiles = pageViewers.some(
      (viewer) => !existingUsernames.has(viewer.linkedinUsername.toLowerCase())
    );
    consecutivePagesWithoutNewProfiles = pageHasNewProfiles
      ? 0
      : consecutivePagesWithoutNewProfiles + 1;

    const writeResult = await upsertProfileViewers(
      user.uid,
      pageViewers,
      existingSnapshot,
      {
        seenAt: syncSeenAt,
        positionOffset,
      }
    );
    savedCount += writeResult.savedCount;
    newCount += writeResult.newCount;
    newProfileUsernames.push(...writeResult.newProfileUsernames);
    const searchWriteResult = await upsertProfileViewerSearches(
      user.uid,
      page.searches,
      Array.from(existingSearchesByKey.values()),
      {
        seenAt: syncSeenAt,
        positionOffset,
      }
    );
    searchSavedCount += searchWriteResult.savedCount;
    newSearchCount += searchWriteResult.newCount;
    if (page.privateViewerCount !== null) {
      privateViewerCount = page.privateViewerCount;
    }
    page.searches.forEach((search) => {
      const existing = existingSearchesByKey.get(search.searchKey);
      existingSearchesByKey.set(search.searchKey, {
        id: encodeURIComponent(search.searchKey),
        itemType: 'search',
        searchKey: search.searchKey,
        searchUrl: search.searchUrl,
        displayName: search.displayName,
        keywords: search.keywords,
        currentCompany: search.currentCompany,
        viewedAgoText: search.viewedAgoText,
        firstSeenAt: existing?.firstSeenAt || syncSeenAt,
        lastSeenAt: syncSeenAt,
        lastSeenPosition:
          positionOffset + (search.listPosition ?? collectedSearches.size),
        source: 'linkedin_profile_views',
      });
      collectedSearches.set(search.searchKey, search);
    });
    updateExistingProfileViewerSnapshot(
      existingByUsername,
      pageViewers,
      syncSeenAt,
      positionOffset
    );
    collectedViewers.splice(
      0,
      collectedViewers.length,
      ...mergeProfileViewerCandidates([collectedViewers, pageViewers])
    );

    const nextCursor = page.nextCursor;
    if (paginationMode === 'backfill') {
      const completedBackfill = !nextCursor;
      syncState = {
        ...syncState,
        backfillStatus: completedBackfill ? 'complete' : 'in_progress',
        backfillNextStart: nextCursor?.start,
        backfillPageSize: nextCursor?.count,
        backfillStartedAt: syncState.backfillStartedAt || syncSeenAt,
        backfillCompletedAt: completedBackfill ? Date.now() : undefined,
        backfillPagesFetched: syncState.backfillPagesFetched + 1,
        backfillProfilesSaved: syncState.backfillProfilesSaved + writeResult.savedCount,
        recentProfileViewerUsernames: extendBackfillRecentProfileViewerSnapshot(
          syncState.recentProfileViewerUsernames,
          pageViewers.map((viewer) => viewer.linkedinUsername),
          positionOffset
        ),
        updatedAt: Date.now(),
      };
      await persistSyncProgress(syncState);
    }

    if (!nextCursor) {
      paginationComplete = true;
      break;
    }

    if (
      paginationMode === 'incremental' &&
      shouldStopIncrementalProfileViewerPagination(
        collectedViewers,
        pageViewers,
        existingUsernames,
        syncState.recentProfileViewerUsernames,
        consecutivePagesWithoutNewProfiles
      )
    ) {
      paginationComplete = true;
      break;
    }

    if (pagesFetched >= PROFILE_VIEWERS_MAX_PAGES_PER_SYNC) {
      break;
    }

    if (visitedCursors.has(nextCursor.start)) {
      throw new ProfileViewersSyncError(
        `LinkedIn profile viewers pagination repeated cursor ${nextCursor.start}.`,
        'parse_error',
        page.httpStatus
      );
    }
    visitedCursors.add(nextCursor.start);

    if (!canMakeProfileViewersRequest(syncState, Date.now())) {
      break;
    }

    syncState = recordProfileViewersRequest(syncState, Date.now());
    if (paginationMode === 'backfill') {
      syncState = {
        ...syncState,
        backfillStatus: 'in_progress',
        backfillNextStart: nextCursor.start,
        backfillPageSize: nextCursor.count,
      };
    }
    await persistSyncProgress(syncState);

    cursor = nextCursor;
    positionOffset = cursor.start;
    page = await fetchProfileViewersPaginationPage(cursor, csrfToken);
  }

  if (privateViewerCount !== undefined) {
    await updateProfileViewerSummary(user.uid, privateViewerCount, syncSeenAt);
  }

  if (paginationMode === 'incremental') {
    syncState = {
      ...syncState,
      recentProfileViewerUsernames: createRecentProfileViewerSnapshot(
        collectedViewers.map((viewer) => viewer.linkedinUsername),
        syncState.recentProfileViewerUsernames
      ),
      updatedAt: Date.now(),
    };
    await persistSyncProgress(syncState);
  }

  console.info('[profile-viewers-sync] pagination', {
    mode: paginationMode,
    pagesFetched,
    requestCount,
    profilesCollected: collectedViewers.length,
    searchesCollected: collectedSearches.size,
    privateViewerCount,
    paginationComplete,
    backfillStatus: syncState.backfillStatus,
    backfillNextStart: syncState.backfillNextStart,
  });

  return {
    savedCount,
    newCount,
    searchSavedCount,
    newSearchCount,
    newProfileUsernames,
    visibleCount: collectedViewers.length,
    visibleSearchCount: collectedSearches.size,
    privateViewerCount,
    updatedCount: savedCount - newCount,
    visibleProfileUsernames: collectedViewers.map((viewer) => viewer.linkedinUsername),
    httpStatus,
    responseLength,
    requestCount,
    pagesFetched,
    paginationComplete,
    paginationMode,
  };
}

async function syncProfileViewersViaPage(): Promise<ProfileViewersSyncResult> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    throw new ProfileViewersSyncError(
      'myFeedPilot authentication is required before profile visitors can be saved.',
      'app_auth_required'
    );
  }

  const [visibleViewers, existingViewers] = await Promise.all([
    scrapeProfileViewersFromInactiveTab(),
    getProfileViewers(user.uid),
  ]);
  const result = await upsertProfileViewers(user.uid, visibleViewers, existingViewers);
  return {
    ...result,
    visibleCount: visibleViewers.length,
    updatedCount: result.savedCount - result.newCount,
    visibleProfileUsernames: visibleViewers.map((viewer) => viewer.linkedinUsername),
  };
}

function normalizeFeatureSettings(settings?: Partial<UserFeatureSettings> | null): UserFeatureSettings {
  return {
    messagingButtons: settings?.messagingButtons ?? DEFAULT_FEATURE_SETTINGS.messagingButtons,
    postButtons: settings?.postButtons ?? DEFAULT_FEATURE_SETTINGS.postButtons,
    speechToComment: settings?.speechToComment ?? DEFAULT_FEATURE_SETTINGS.speechToComment,
    hideProfileViewers: settings?.hideProfileViewers ?? DEFAULT_FEATURE_SETTINGS.hideProfileViewers,
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

function formatUserInfo(user: { uid: string; displayName: string; email: string; photoURL: string }) {
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

async function getStoredFeedsAuthContext(): Promise<{
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

interface ProfileViewersSyncCoordinatorResult {
  ran: boolean;
  success: boolean;
  result?: ProfileViewersSyncResult;
  error?: string;
}

type ProfileViewersWakeEventName =
  | 'worker_loaded'
  | 'runtime_installed'
  | 'chrome_startup'
  | 'alarm_received'
  | 'linkedin_activity'
  | 'sign_in'
  | 'coordinator_started'
  | 'auth_unavailable_alarm_preserved'
  | 'auth_unavailable_retry_scheduled'
  | 'auth_absent_alarm_cleared'
  | 'sync_skipped'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'alarm_scheduled'
  | 'alarm_cleared';

interface ProfileViewersWakeEvent {
  id: string;
  at: number;
  event: ProfileViewersWakeEventName;
  extensionId: string;
  trigger?: ProfileViewersSyncTrigger;
  reason?: string;
  scheduledAt?: number;
  nextDueAt?: number;
  hasStoredUser?: boolean;
  hasStoredTokens?: boolean;
  authRecoveryAttempts?: number;
  success?: boolean;
  error?: string;
}

let profileViewersSyncCoordinatorPromise: Promise<ProfileViewersSyncCoordinatorResult> | null = null;
let profileViewersWakeLogWritePromise: Promise<void> = Promise.resolve();

function appendProfileViewersWakeEvent(
  event: Omit<ProfileViewersWakeEvent, 'id' | 'at' | 'extensionId'>
): Promise<void> {
  const at = Date.now();
  const wakeEvent: ProfileViewersWakeEvent = {
    ...event,
    id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    extensionId: chrome.runtime.id,
  };

  profileViewersWakeLogWritePromise = profileViewersWakeLogWritePromise
    .catch(() => {
      /* keep later diagnostic writes working after a storage failure */
    })
    .then(async () => {
      const stored = await getStorageValue<{
        [PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY]?: ProfileViewersWakeEvent[];
      }>(PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY);
      const events = Array.isArray(stored[PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY])
        ? stored[PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY]
        : [];

      await setStorageValue({
        [PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY]: [wakeEvent, ...events].slice(
          0,
          PROFILE_VIEWERS_WAKE_LOG_LIMIT
        ),
      });
    })
    .catch((error) => {
      console.warn('[profile-viewers-sync] Failed to persist wake event:', error);
    });

  return profileViewersWakeLogWritePromise;
}

async function getStoredProfileViewersSyncState(): Promise<Partial<ProfileViewersSyncState> | null> {
  const stored = await getStorageValue<{
    [PROFILE_VIEWERS_SYNC_STORAGE_KEY]?: Partial<ProfileViewersSyncState>;
  }>(PROFILE_VIEWERS_SYNC_STORAGE_KEY);
  const state = stored[PROFILE_VIEWERS_SYNC_STORAGE_KEY];
  return state?.version === 1 ? state : null;
}

async function getProfileViewersSyncState(userId: string): Promise<ProfileViewersSyncState> {
  const now = Date.now();
  const state = await getStoredProfileViewersSyncState();

  if (!state || state.userId !== userId) {
    return createProfileViewersSyncState(userId, now);
  }

  const isCurrentSchedulePolicy = state.schedulePolicyVersion === 2;

  return {
    ...createProfileViewersSyncState(userId, now),
    ...state,
    schedulePolicyVersion: 2,
    nextDueAt: isCurrentSchedulePolicy ? state.nextDueAt : now,
    retryAt: isCurrentSchedulePolicy ? state.retryAt : undefined,
    cooldownUntil: isCurrentSchedulePolicy ? state.cooldownUntil : undefined,
    cycleStartedAt: isCurrentSchedulePolicy ? state.cycleStartedAt : undefined,
    attemptStartedAt: isCurrentSchedulePolicy ? state.attemptStartedAt : undefined,
    attemptExpiresAt: isCurrentSchedulePolicy ? state.attemptExpiresAt : undefined,
    requestWindowStartedAt: isCurrentSchedulePolicy ? state.requestWindowStartedAt : undefined,
    lastError: isCurrentSchedulePolicy ? state.lastError : undefined,
    requestCountInWindow:
      isCurrentSchedulePolicy &&
      typeof state.requestCountInWindow === 'number' &&
      state.requestCountInWindow >= 0
        ? state.requestCountInWindow
        : 0,
    consecutiveFailedCycles:
      isCurrentSchedulePolicy &&
      typeof state.consecutiveFailedCycles === 'number' &&
      state.consecutiveFailedCycles >= 0
        ? state.consecutiveFailedCycles
        : 0,
    authRecoveryAttempts:
      typeof state.authRecoveryAttempts === 'number' && state.authRecoveryAttempts >= 0
        ? state.authRecoveryAttempts
        : 0,
    authRecoveryAt:
      typeof state.authRecoveryAt === 'number' && state.authRecoveryAt > 0
        ? state.authRecoveryAt
        : undefined,
    backfillStatus:
      state.backfillStatus === 'in_progress' || state.backfillStatus === 'complete'
        ? state.backfillStatus
        : 'not_started',
    backfillPagesFetched:
      typeof state.backfillPagesFetched === 'number' && state.backfillPagesFetched >= 0
        ? state.backfillPagesFetched
        : 0,
    backfillProfilesSaved:
      typeof state.backfillProfilesSaved === 'number' && state.backfillProfilesSaved >= 0
        ? state.backfillProfilesSaved
        : 0,
    backfillNextStart:
      typeof state.backfillNextStart === 'number' && state.backfillNextStart >= 0
        ? state.backfillNextStart
        : undefined,
    backfillPageSize:
      typeof state.backfillPageSize === 'number' && state.backfillPageSize > 0
        ? state.backfillPageSize
        : undefined,
    recentProfileViewerUsernames: Array.isArray(state.recentProfileViewerUsernames)
      ? state.recentProfileViewerUsernames.filter(
          (username): username is string => typeof username === 'string'
        ).slice(0, PROFILE_VIEWERS_RECENT_SNAPSHOT_LIMIT)
      : [],
    attemptsInCycle:
      isCurrentSchedulePolicy && (state.attemptsInCycle === 1 || state.attemptsInCycle === 2)
        ? state.attemptsInCycle
        : 0,
    logs: Array.isArray(state.logs) ? state.logs.slice(0, PROFILE_VIEWERS_SYNC_LOG_LIMIT) : [],
  };
}

async function setProfileViewersSyncState(state: ProfileViewersSyncState): Promise<void> {
  await setStorageValue({
    [PROFILE_VIEWERS_SYNC_STORAGE_KEY]: {
      ...state,
      logs: state.logs.slice(0, PROFILE_VIEWERS_SYNC_LOG_LIMIT),
    },
  });
}

async function setProfileViewersAuthRecoveryState(
  state: Partial<ProfileViewersSyncState> | null,
  authRecoveryAttempts: number,
  authRecoveryAt?: number
): Promise<void> {
  if (!state) {
    return;
  }

  await setStorageValue({
    [PROFILE_VIEWERS_SYNC_STORAGE_KEY]: {
      ...state,
      authRecoveryAttempts,
      authRecoveryAt,
      updatedAt: Date.now(),
    },
  });
}

async function clearProfileViewersAlarm(reason = 'no_next_run'): Promise<void> {
  if (!chrome.alarms?.clear) {
    return;
  }

  const cleared = await chrome.alarms.clear(PROFILE_VIEWERS_ALARM_NAME);
  await appendProfileViewersWakeEvent({
    event: 'alarm_cleared',
    reason: `${reason}:${cleared ? 'existing' : 'missing'}`,
  });
}

async function scheduleProfileViewersAlarmAt(when: number, reason: string): Promise<void> {
  if (!chrome.alarms?.create) {
    return;
  }

  const scheduledAt = Math.max(when, Date.now() + 30_000);
  await chrome.alarms.create(PROFILE_VIEWERS_ALARM_NAME, { when: scheduledAt });
  await appendProfileViewersWakeEvent({
    event: 'alarm_scheduled',
    reason,
    scheduledAt,
  });
}

async function scheduleNextProfileViewersAlarm(state: ProfileViewersSyncState): Promise<void> {
  const nextAlarmAt = getNextProfileViewersAlarmAt(state);
  if (!nextAlarmAt || !chrome.alarms?.create) {
    await clearProfileViewersAlarm('state_has_no_next_run');
    return;
  }

  await scheduleProfileViewersAlarmAt(nextAlarmAt, 'sync_state');
}

function getProfileViewersSyncError(error: unknown): {
  code: ProfileViewersSyncErrorCode;
  message: string;
  httpStatus?: number;
} {
  if (error instanceof ProfileViewersSyncError) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: error.httpStatus,
    };
  }

  const message = error instanceof Error ? error.message : String(error || 'Unknown profile visitors sync error');
  const normalized = message.toLowerCase();
  if (normalized.includes('network') || normalized.includes('failed to fetch')) {
    return { code: 'network_error', message };
  }

  return { code: 'unknown_error', message };
}

function getProfileViewersSyncLogStatus(
  errorCode?: ProfileViewersSyncErrorCode,
  newCount = 0
): ProfileViewersSyncLog['status'] {
  if (!errorCode) {
    return newCount > 0 ? 'success' : 'no_changes';
  }

  if (errorCode === 'app_auth_required' || errorCode === 'linkedin_auth_required') {
    return 'auth_error';
  }

  if (errorCode === 'network_error') {
    return 'network_error';
  }

  if (errorCode === 'api_error') {
    return 'api_error';
  }

  if (errorCode === 'parse_error') {
    return 'parse_error';
  }

  return 'unknown_error';
}

function appendProfileViewersSyncLog(
  state: ProfileViewersSyncState,
  log: ProfileViewersSyncLog
): ProfileViewersSyncState {
  return {
    ...state,
    logs: [log, ...state.logs].slice(0, PROFILE_VIEWERS_SYNC_LOG_LIMIT),
  };
}

function getProfileViewersSyncSkipReason(
  state: ProfileViewersSyncState,
  now: number
): string {
  if (!canMakeProfileViewersRequest(state, now)) {
    return 'request_rate_limit';
  }

  if (state.cooldownUntil && now < state.cooldownUntil) {
    return 'cooldown';
  }

  if (state.retryAt && now < state.retryAt) {
    return 'retry_not_due';
  }

  if (state.nextDueAt && now < state.nextDueAt) {
    return 'next_run_not_due';
  }

  return 'decision_blocked';
}

async function notifyLinkedInTabsAboutProfileViewersSync(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) =>
        chrome.tabs.sendMessage(tab.id, { type: 'PROFILE_VIEWERS_SYNC_COMPLETED' }).catch(() => {
          /* the sidebar content script may not be ready in every LinkedIn tab */
        })
      )
  );
}

async function runProfileViewersSyncCoordinator(
  trigger: ProfileViewersSyncTrigger,
  force = false
): Promise<ProfileViewersSyncCoordinatorResult> {
  await appendProfileViewersWakeEvent({
    event: 'coordinator_started',
    trigger,
    reason: force ? 'forced' : 'scheduled',
  });

  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    const now = Date.now();
    const [authContext, storedState] = await Promise.all([
      getStoredFeedsAuthContext(),
      getStoredProfileViewersSyncState(),
    ]);
    const recoveryState =
      authContext.userId && storedState?.userId !== authContext.userId
        ? createProfileViewersSyncState(authContext.userId, now)
        : storedState;
    const authRecoveryPlan = getProfileViewersAuthRecoveryPlan({
      now,
      nextDueAt: recoveryState?.nextDueAt,
      previousAttempts: recoveryState?.authRecoveryAttempts || 0,
      hasAuthHint: authContext.hasStoredUser || authContext.hasStoredTokens,
    });

    if (authRecoveryPlan.action === 'clear_alarm') {
      await setProfileViewersAuthRecoveryState(recoveryState, 0);
      await clearProfileViewersAlarm('app_auth_absent');
      await appendProfileViewersWakeEvent({
        event: 'auth_absent_alarm_cleared',
        trigger,
        reason: authRecoveryPlan.reason,
        hasStoredUser: authContext.hasStoredUser,
        hasStoredTokens: authContext.hasStoredTokens,
      });
    } else {
      await setProfileViewersAuthRecoveryState(
        recoveryState,
        authRecoveryPlan.attempts,
        authRecoveryPlan.scheduledAt
      );
      await scheduleProfileViewersAlarmAt(
        authRecoveryPlan.scheduledAt,
        authRecoveryPlan.reason
      );
      await appendProfileViewersWakeEvent({
        event:
          authRecoveryPlan.reason === 'preserve_next_due'
            ? 'auth_unavailable_alarm_preserved'
            : 'auth_unavailable_retry_scheduled',
        trigger,
        reason: authRecoveryPlan.reason,
        scheduledAt: authRecoveryPlan.scheduledAt,
        nextDueAt: recoveryState?.nextDueAt,
        hasStoredUser: authContext.hasStoredUser,
        hasStoredTokens: authContext.hasStoredTokens,
        authRecoveryAttempts: authRecoveryPlan.attempts,
      });
    }

    return {
      ran: false,
      success: false,
      error: 'myFeedPilot authentication is required before profile visitors can be synchronized.',
    };
  }

  let state = await getProfileViewersSyncState(user.uid);
  const hadAuthRecoveryState = state.authRecoveryAttempts > 0 || Boolean(state.authRecoveryAt);
  if (hadAuthRecoveryState) {
    state = {
      ...state,
      authRecoveryAttempts: 0,
      authRecoveryAt: undefined,
      updatedAt: Date.now(),
    };
  }

  const decisionAt = Date.now();
  const decision = decideProfileViewersSync(state, decisionAt, trigger, force);
  if (!decision.shouldRun || !decision.attemptNumber || !decision.runType) {
    if (hadAuthRecoveryState) {
      await setProfileViewersSyncState(state);
    }
    await scheduleNextProfileViewersAlarm(state);
    await appendProfileViewersWakeEvent({
      event: 'sync_skipped',
      trigger,
      reason: getProfileViewersSyncSkipReason(state, decisionAt),
      nextDueAt: getNextProfileViewersAlarmAt(state) || undefined,
    });
    return { ran: false, success: true };
  }

  const startedAt = Date.now();
  const attemptNumber = decision.attemptNumber;
  const runType: ProfileViewersSyncRunType = decision.runType;
  const attemptIntervalMs = getProfileViewersScheduledIntervalMs();
  await appendProfileViewersWakeEvent({
    event: 'sync_started',
    trigger,
    reason: runType,
    nextDueAt: state.nextDueAt,
  });
  state = startProfileViewersSyncAttempt(state, startedAt, attemptNumber, attemptIntervalMs);
  await setProfileViewersSyncState(state);
  await scheduleNextProfileViewersAlarm(state).catch((error) => {
    console.warn('[profile-viewers-sync] Failed to schedule attempt recovery alarm:', error);
  });

  try {
    const result = await syncProfileViewersViaApi(user, state, async (progressState) => {
      state = progressState;
      await setProfileViewersSyncState(state);
    });
    const finishedAt = Date.now();
    const scheduledIntervalMs = getProfileViewersScheduledIntervalMs();
    state = completeProfileViewersSyncSuccess(state, finishedAt, scheduledIntervalMs);
    const log: ProfileViewersSyncLog = {
      id: `${startedAt}-${attemptNumber}`,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      trigger,
      runType,
      attemptNumber,
      status: getProfileViewersSyncLogStatus(
        undefined,
        result.newCount + (result.newSearchCount || 0)
      ),
      httpStatus: result.httpStatus,
      responseLength: result.responseLength,
      requestCount: result.requestCount,
      pagesFetched: result.pagesFetched,
      paginationComplete: result.paginationComplete,
      paginationMode: result.paginationMode,
      backfillStatus: state.backfillStatus,
      visibleCount: result.visibleCount,
      visibleSearchCount: result.visibleSearchCount,
      privateViewerCount: result.privateViewerCount,
      savedCount: result.savedCount,
      searchSavedCount: result.searchSavedCount,
      newCount: result.newCount,
      newSearchCount: result.newSearchCount,
      updatedCount: result.updatedCount,
      visibleProfileUsernames: result.visibleProfileUsernames.slice(
        0,
        PROFILE_VIEWERS_SYNC_LOG_USERNAME_LIMIT
      ),
      newProfileUsernames: result.newProfileUsernames.slice(
        0,
        PROFILE_VIEWERS_SYNC_LOG_USERNAME_LIMIT
      ),
      recoveredFromInterruptedAttempt: decision.recoveredFromInterruptedAttempt,
      requestCountInWindow: state.requestCountInWindow,
      rateLimitResetAt: getProfileViewersRateLimitResetAt(state),
      scheduledIntervalMs,
      consecutiveFailedCycles: state.consecutiveFailedCycles,
      nextScheduledAt: state.nextDueAt || finishedAt,
    };
    state = appendProfileViewersSyncLog(state, log);
    await setProfileViewersSyncState(state);
    await scheduleNextProfileViewersAlarm(state);
    await notifyLinkedInTabsAboutProfileViewersSync().catch((error) => {
      console.warn('[profile-viewers-sync] Failed to notify LinkedIn tabs:', error);
    });
    await appendProfileViewersWakeEvent({
      event: 'sync_completed',
      trigger,
      reason: log.status,
      nextDueAt: log.nextScheduledAt,
      success: true,
    });
    console.info('[profile-viewers-sync]', log);
    return { ran: true, success: true, result };
  } catch (error) {
    const finishedAt = Date.now();
    const syncError = getProfileViewersSyncError(error);
    state = completeProfileViewersSyncFailure(state, finishedAt, attemptNumber, syncError);
    const log: ProfileViewersSyncLog = {
      id: `${startedAt}-${attemptNumber}`,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      trigger,
      runType,
      attemptNumber,
      status: getProfileViewersSyncLogStatus(syncError.code),
      httpStatus: syncError.httpStatus,
      visibleCount: 0,
      savedCount: 0,
      newCount: 0,
      updatedCount: 0,
      visibleProfileUsernames: [],
      newProfileUsernames: [],
      recoveredFromInterruptedAttempt: decision.recoveredFromInterruptedAttempt,
      requestCountInWindow: state.requestCountInWindow,
      rateLimitResetAt: getProfileViewersRateLimitResetAt(state),
      consecutiveFailedCycles: state.consecutiveFailedCycles,
      cooldownUntil: state.cooldownUntil,
      backfillStatus: state.backfillStatus,
      errorCode: syncError.code,
      errorMessage: syncError.message,
      nextScheduledAt: getNextProfileViewersAlarmAt(state) || state.nextDueAt || finishedAt,
    };
    state = appendProfileViewersSyncLog(state, log);
    await setProfileViewersSyncState(state);
    await scheduleNextProfileViewersAlarm(state);
    await appendProfileViewersWakeEvent({
      event: 'sync_failed',
      trigger,
      reason: syncError.code,
      nextDueAt: log.nextScheduledAt,
      success: false,
      error: syncError.message,
    });
    console.warn('[profile-viewers-sync]', log);
    return {
      ran: true,
      success: false,
      error: syncError.message,
    };
  }
}

function queueProfileViewersSync(
  trigger: ProfileViewersSyncTrigger,
  force = false
): Promise<ProfileViewersSyncCoordinatorResult> {
  if (profileViewersSyncCoordinatorPromise) {
    return profileViewersSyncCoordinatorPromise.then(() => queueProfileViewersSync(trigger, force));
  }

  const coordinatorPromise = runProfileViewersSyncCoordinator(trigger, force).finally(() => {
    if (profileViewersSyncCoordinatorPromise === coordinatorPromise) {
      profileViewersSyncCoordinatorPromise = null;
    }
  });
  profileViewersSyncCoordinatorPromise = coordinatorPromise;
  return coordinatorPromise;
}

function normalizeFeedsError(error: unknown, fallback = 'Something went wrong'): string {
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
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

  if (normalized.includes('permission-denied') || normalized.includes('missing or insufficient permissions')) {
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

function getFeedsAuthErrorResponse<T extends Record<string, unknown>>(
  extra?: T
): { success: false; error: string } & T {
  return {
    success: false,
    error: 'Session expired, please sign in again.',
    ...(extra || ({} as T)),
  };
}

chrome.runtime.onInstalled.addListener((details) => {
  const trigger: ProfileViewersSyncTrigger = details.reason === 'install' ? 'install' : 'update';
  void appendProfileViewersWakeEvent({
    event: 'runtime_installed',
    trigger,
    reason: details.reason,
  });
  void queueProfileViewersSync(trigger);
});

chrome.runtime.onStartup.addListener(() => {
  void appendProfileViewersWakeEvent({
    event: 'chrome_startup',
    trigger: 'chrome_startup',
  });
  void queueProfileViewersSync('chrome_startup');
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name !== PROFILE_VIEWERS_ALARM_NAME) {
    return;
  }

  void appendProfileViewersWakeEvent({
    event: 'alarm_received',
    trigger: 'alarm',
    scheduledAt: alarm.scheduledTime,
  });
  void queueProfileViewersSync('alarm');
});

void appendProfileViewersWakeEvent({
  event: 'worker_loaded',
  trigger: 'service_worker',
});
void queueProfileViewersSync('service_worker');

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

  if (message.type === 'FEEDS_GET_ALL') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          console.warn('[feeds] FEEDS_GET_ALL: no authenticated user');
          sendResponse(getFeedsAuthErrorResponse({ feeds: null }));
          return;
        }

        console.log('[feeds] FEEDS_GET_ALL: fetching feeds for uid:', user.uid);
        return getFeeds(user.uid).then((feeds) => {
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

        return Promise.all([
          getProfileViewerItems(user.uid),
          getProfileViewerSummary(user.uid),
        ]).then(([viewers, summary]) => {
          sendResponse({ success: true, viewers, summary });
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

  if (message.type === 'PROFILE_VIEWERS_LINKEDIN_ACTIVITY') {
    void appendProfileViewersWakeEvent({
      event: 'linkedin_activity',
      trigger: 'linkedin_activity',
      reason: sender.tab?.id ? `tab:${sender.tab.id}` : 'content_script',
    });
    queueProfileViewersSync('linkedin_activity')
      .then((result) => {
        sendResponse({ success: result.success, ran: result.ran });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          ran: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_SYNC_STATUS_GET') {
    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ syncState: null }));
          return;
        }

        const syncState = await getProfileViewersSyncState(user.uid);
        sendResponse({ success: true, syncState });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          syncState: null,
          error: normalizeFeedsError(error, 'Failed to load profile visitors sync status'),
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_SYNC_API_NOW' || message.type === 'PROFILE_VIEWERS_SYNC_NOW') {
    queueProfileViewersSync('manual', true)
      .then((coordinatorResult) => {
        sendResponse({
          success: coordinatorResult.success,
          source: 'api',
          ...(coordinatorResult.result || {
            savedCount: 0,
            newCount: 0,
            visibleCount: 0,
          }),
          error: coordinatorResult.error,
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to sync profile visitors via API'),
          savedCount: 0,
          newCount: 0,
          visibleCount: 0,
          source: 'api',
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_SYNC_PAGE_NOW') {
    syncProfileViewersViaPage()
      .then((result) => {
        sendResponse({ success: true, source: 'page', ...result });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to sync profile visitors via LinkedIn page'),
          savedCount: 0,
          newCount: 0,
          visibleCount: 0,
          source: 'page',
        });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_UPDATE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return updateProfileViewer(
          user.uid,
          message.viewerId as string,
          (message.updates || {}) as Parameters<typeof updateProfileViewer>[2]
        ).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to update profile visitor') });
      });
    return true;
  }

  if (message.type === 'PROFILE_VIEWERS_REMOVE') {
    getAuthenticatedFeedsUser()
      .then((user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse());
          return;
        }

        return removeProfileViewer(user.uid, message.viewerId as string).then(() => {
          sendResponse({ success: true });
        });
      })
      .catch((error) => {
        sendResponse({ success: false, error: normalizeFeedsError(error, 'Failed to remove profile visitor') });
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

        return createFeed(user.uid, message.name, message.description, message.color).then((feed) => {
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
        return addMemberToFeed((message.ownerId as string) || user.uid, message.feedId, profileData).then(
          ({ member, alreadyExists }) => {
            sendResponse({ success: true, member, alreadyExists });
          }
        );
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

        return removeMemberFromFeed((message.ownerId as string) || user.uid, message.feedId, message.memberId).then(
          () => {
            sendResponse({ success: true });
          }
        );
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

        return updateMemberInFeed(
          (message.ownerId as string) || user.uid,
          message.feedId,
          message.memberId,
          message.updates
        ).then(() => {
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

        return getFeedMembers((message.ownerId as string) || user.uid, message.feedId).then((members) => {
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
        ).then((memberships) => {
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

        return deleteFeed(user.uid, message.feedId).then(() => {
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

        return updateFeed(user.uid, message.feedId, message.updates).then(() => {
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

        return reorderFeeds(user.uid, (message.feedIds as string[]) || []).then(() => {
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
        return getFollowedFeeds(user.uid).then((sharedFeeds) => {
          sendResponse({ success: true, sharedFeeds });
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to load shared feeds'),
          sharedFeeds: [],
        });
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
        return getFeedShares(user.uid, message.feedId).then((shares) => {
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
        return shareFeedWithUser(user.uid, message.feedId, message.email, message.role).then((share) => {
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
        return updateFeedShareRole(user.uid, message.feedId, message.targetUid, message.role).then(() => {
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
        return removeFeedShare(user.uid, message.feedId, message.targetUid).then(() => {
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
        return ensureFeedShareLink(user.uid, message.feedId).then((token) => {
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
        return followFeedByShareToken(user.uid, message.token).then((sharedFeed) => {
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
        return unfollowFeed(user.uid, message.ownerId, message.feedId).then(() => {
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
        return duplicateSharedFeed(user.uid, message.ownerId, message.feedId).then((feed) => {
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
