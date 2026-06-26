import type { FeedMemberInfo } from '../feeds-sidebar/types';
import { getCanonicalLinkedInUsername } from '../../../../shared/linkedin-identity';
import { cacheCanonicalUsername, cacheStatus, clearStatusCache, getCachedCanonicalUsername, getCachedStatus, invalidateCacheForUser } from './cache';
import { GRAPHQL_QUERY_IDS, REQUEST_DELAY_MS, STATUS_FETCH_CONCURRENCY } from './constants';
import { fetchProfileImageFromProfilePage, fetchStatusFromProfilePage, fetchWithGraphQL, isLikelyLinkedInProfileToken, resolveCanonicalLinkedInIdentity, resolveProfileUrn, sendLinkedInConnectRequest, sendLinkedInFollowState } from './api';
import { delay, normalizeRelationshipResolution } from './utils';
import type { RelationshipResolution } from './types';
import {
  isLinkedInStatusFetchBlockLikeError,
  LinkedInStatusFetchError,
} from './errors';

type RelationshipStatusResult = RelationshipResolution;
interface FetchRelationshipStatusOptions {
  requireActionIdentifiers?: boolean;
}

type FetchSingleStatusOptions = FetchRelationshipStatusOptions;
const BACKGROUND_STATUS_FALLBACK_WINDOW_MS = 5 * 60 * 1000;
const BACKGROUND_STATUS_FALLBACK_MAX_PER_WINDOW = 20;
const backgroundStatusFallbackInFlight = new Map<string, Promise<RelationshipStatusResult | null>>();
let backgroundStatusFallbackWindowStartedAt = 0;
let backgroundStatusFallbackRequestCount = 0;

function isUsableProfileImageUrl(url?: string): url is string {
  if (!url) {
    return false;
  }

  const expiryMatch = url.match(/[?&]e=(\d{10,13})(?:&|$)/);
  if (!expiryMatch?.[1]) {
    return true;
  }

  const rawExpiry = Number(expiryMatch[1]);
  const expiresAt = expiryMatch[1].length > 10 ? rawExpiry : rawExpiry * 1000;
  return expiresAt > Date.now();
}

async function ensureCanonicalIdentity(member: FeedMemberInfo): Promise<string> {
  const currentUsername = getCanonicalLinkedInUsername(member);
  if (!currentUsername) {
    throw new Error('Member has no LinkedIn username');
  }

  const cachedCanonicalUsername = getCachedCanonicalUsername(currentUsername);
  if (cachedCanonicalUsername) {
    if (cachedCanonicalUsername !== currentUsername) {
      member.linkedinUsername = cachedCanonicalUsername;
      member.linkedinUrl = `https://www.linkedin.com/in/${encodeURIComponent(cachedCanonicalUsername)}/`;
    }
    return cachedCanonicalUsername;
  }

  if (!isLikelyLinkedInProfileToken(currentUsername)) {
    cacheCanonicalUsername(currentUsername, currentUsername);
    return currentUsername;
  }

  try {
    const resolvedIdentity = await resolveCanonicalLinkedInIdentity(member.linkedinUrl || currentUsername, currentUsername);
    if (resolvedIdentity?.username) {
      cacheCanonicalUsername(currentUsername, resolvedIdentity.username);
      member.linkedinUsername = resolvedIdentity.username;
      member.linkedinUrl = resolvedIdentity.linkedinUrl;
      return resolvedIdentity.username;
    }
  } catch (error) {
    console.warn(`[LFS] Failed to resolve canonical LinkedIn username for ${currentUsername}:`, error);
  }

  cacheCanonicalUsername(currentUsername, currentUsername);
  return currentUsername;
}

async function enrichResultWithProfileImage(
  username: string,
  result: RelationshipStatusResult,
  existingProfileImageUrl?: string
): Promise<RelationshipStatusResult> {
  if (isUsableProfileImageUrl(result.profileImageUrl)) {
    return result;
  }

  if (isUsableProfileImageUrl(existingProfileImageUrl)) {
    return {
      ...result,
      profileImageUrl: existingProfileImageUrl,
    };
  }

  try {
    console.log(`[LFS] ${username}: profile image missing or expired, fetching profile HTML fallback`);
    const profileImageUrl = await fetchProfileImageFromProfilePage(username, result.profileUrn);
    if (profileImageUrl) {
      return {
        ...result,
        profileImageUrl,
      };
    }
  } catch (error) {
    console.warn(`[LFS] Profile image HTML fallback failed for ${username}:`, error);
  }

  return result;
}

function cacheResolvedStatus(username: string, result: RelationshipStatusResult): void {
  cacheStatus(
    username,
    result.status,
    result.profileUrn,
    result.canMessage,
    result.canFollow,
    result.canConnect,
    result.isFollowing,
    result.memberNumericId,
    result.isPremium,
    result.profileImageUrl
  );
}

function shouldPreserveWithdrawnStatus(
  currentStatus: FeedMemberInfo['status'],
  nextStatus?: RelationshipResolution['status']
): boolean {
  return currentStatus === 'withdrawn' && (nextStatus === 'connect' || nextStatus === 'following');
}

function shouldPreserveUnavailableStatus(
  currentStatus: FeedMemberInfo['status'],
  nextStatus?: RelationshipResolution['status']
): boolean {
  return (
    currentStatus === 'unavailable' &&
    (nextStatus === 'connect' || nextStatus === 'following' || nextStatus === 'pending')
  );
}

function hasActionIdentifiers(result: RelationshipStatusResult): boolean {
  return Boolean(result.profileUrn && result.memberNumericId);
}

function canUseStatusResult(
  result: RelationshipStatusResult,
  options: FetchSingleStatusOptions = {}
): boolean {
  if (result.status === 'unavailable') {
    return true;
  }

  return !options.requireActionIdentifiers || hasActionIdentifiers(result);
}

function mergeActionIdentifierResult(
  primary: RelationshipStatusResult,
  source: RelationshipStatusResult
): RelationshipStatusResult {
  const preserveWithdrawn = primary.status === 'withdrawn' && (source.status === 'connect' || source.status === 'following');
  const sourceUnavailable = source.status === 'unavailable';
  const preserveUnavailable =
    sourceUnavailable ||
    primary.status === 'unavailable' &&
    (source.status === 'connect' || source.status === 'following' || source.status === 'pending');

  return normalizeRelationshipResolution({
    status: preserveUnavailable ? 'unavailable' : primary.status,
    profileUrn: primary.profileUrn || source.profileUrn,
    canMessage: preserveUnavailable ? false : primary.canMessage ?? source.canMessage,
    canFollow: preserveUnavailable ? false : source.canFollow ?? primary.canFollow,
    canConnect: preserveWithdrawn || preserveUnavailable ? false : primary.canConnect ?? source.canConnect,
    isFollowing: preserveUnavailable ? false : source.isFollowing ?? primary.isFollowing,
    memberNumericId: primary.memberNumericId || source.memberNumericId,
    isPremium: primary.isPremium ?? source.isPremium,
    profileImageUrl: primary.profileImageUrl || source.profileImageUrl,
  });
}

function applyRelationshipResultToMember(
  member: FeedMemberInfo,
  result: RelationshipResolution
): void {
  const preserveWithdrawn = shouldPreserveWithdrawnStatus(member.status, result.status);
  const preserveUnavailable = shouldPreserveUnavailableStatus(member.status, result.status);

  member.status = preserveUnavailable ? 'unavailable' : preserveWithdrawn ? 'withdrawn' : result.status;
  member.profileUrn = result.profileUrn;
  member.canMessage = preserveUnavailable ? false : result.status === 'connected' ? true : result.canMessage;
  member.canFollow = preserveUnavailable ? false : result.canFollow;
  member.canConnect = preserveWithdrawn || preserveUnavailable ? false : result.canConnect;
  member.isFollowing = preserveUnavailable ? false : result.isFollowing;
  member.memberNumericId = result.memberNumericId;
  member.isPremium = result.isPremium;
  member.profileImageUrl = result.profileImageUrl || member.profileImageUrl;
}

function takeBackgroundFallbackSlot(now = Date.now()): boolean {
  if (
    !backgroundStatusFallbackWindowStartedAt ||
    now - backgroundStatusFallbackWindowStartedAt >= BACKGROUND_STATUS_FALLBACK_WINDOW_MS
  ) {
    backgroundStatusFallbackWindowStartedAt = now;
    backgroundStatusFallbackRequestCount = 0;
  }

  if (backgroundStatusFallbackRequestCount >= BACKGROUND_STATUS_FALLBACK_MAX_PER_WINDOW) {
    return false;
  }

  backgroundStatusFallbackRequestCount += 1;
  return true;
}

function sendRuntimeMessage(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.sendMessage) {
      reject(new Error('Chrome runtime messaging is unavailable'));
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve((response || {}) as Record<string, unknown>);
    });
  });
}

async function fetchStatusWithBackgroundFallback(
  username: string,
  reason: unknown
): Promise<RelationshipStatusResult | null> {
  if (!isLinkedInStatusFetchBlockLikeError(reason)) {
    return null;
  }

  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) {
    return null;
  }

  const existingRequest = backgroundStatusFallbackInFlight.get(normalizedUsername);
  if (existingRequest) {
    return existingRequest;
  }

  if (!takeBackgroundFallbackSlot()) {
    console.warn('[LFS] Background status fallback throttled', {
      username: normalizedUsername,
      windowMs: BACKGROUND_STATUS_FALLBACK_WINDOW_MS,
      maxPerWindow: BACKGROUND_STATUS_FALLBACK_MAX_PER_WINDOW,
    });
    throw new LinkedInStatusFetchError(
      'Background relationship status fallback is throttled',
      'rate_limited'
    );
  }

  const request = sendRuntimeMessage({
    type: 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND',
    linkedinUsername: normalizedUsername,
  })
    .then((response) => {
      if (!response.success || !response.resolution) {
        return null;
      }

      return normalizeRelationshipResolution(response.resolution as RelationshipResolution);
    })
    .finally(() => {
      backgroundStatusFallbackInFlight.delete(normalizedUsername);
    });

  backgroundStatusFallbackInFlight.set(normalizedUsername, request);
  return request;
}

async function fetchSingleStatus(
  member: FeedMemberInfo,
  options: FetchSingleStatusOptions = {}
): Promise<RelationshipStatusResult> {
  const username = await ensureCanonicalIdentity(member);
  let blockLikeError: unknown = null;
  let partialResult: RelationshipStatusResult | null = null;

  for (const queryId of GRAPHQL_QUERY_IDS) {
    try {
      const result = await fetchWithGraphQL(username, queryId);
      if (result) {
        const enrichedResult = normalizeRelationshipResolution(
          await enrichResultWithProfileImage(username, result, member.profileImageUrl)
        );
        console.log(`[LFS] ${username}: status=${enrichedResult.status} isPremium=${enrichedResult.isPremium ?? false} (GraphQL ${queryId.slice(-8)})`);
        if (!canUseStatusResult(enrichedResult, options)) {
          partialResult = partialResult
            ? mergeActionIdentifierResult(partialResult, enrichedResult)
            : enrichedResult;
          continue;
        }
        cacheResolvedStatus(username, enrichedResult);
        return enrichedResult;
      }
    } catch (error) {
      if (isLinkedInStatusFetchBlockLikeError(error)) {
        blockLikeError = error;
        break;
      }
      // try next queryId for ordinary parse/network misses
    }
  }

  if (blockLikeError) {
    const fallbackResult = await fetchStatusWithBackgroundFallback(username, blockLikeError);
    if (fallbackResult) {
      const enrichedFallbackResult = await enrichResultWithProfileImage(
        username,
        fallbackResult,
        member.profileImageUrl
      );
      console.log(`[LFS] ${username}: status=${enrichedFallbackResult.status} (background fallback after content block)`);
      if (!canUseStatusResult(enrichedFallbackResult, options)) {
        partialResult = partialResult
          ? mergeActionIdentifierResult(partialResult, enrichedFallbackResult)
          : enrichedFallbackResult;
      } else {
        cacheResolvedStatus(username, enrichedFallbackResult);
        return enrichedFallbackResult;
      }
    }

    if (!partialResult) {
      throw blockLikeError;
    }
  }

  try {
    const htmlResult = await fetchStatusFromProfilePage(username);
    if (htmlResult) {
      const normalizedHtmlResult = partialResult
        ? mergeActionIdentifierResult(partialResult, normalizeRelationshipResolution(htmlResult))
        : normalizeRelationshipResolution(htmlResult);
      if (!canUseStatusResult(normalizedHtmlResult, options)) {
        partialResult = normalizedHtmlResult;
      } else {
        cacheResolvedStatus(username, normalizedHtmlResult);
        return normalizedHtmlResult;
      }
    }
  } catch (err) {
    if (isLinkedInStatusFetchBlockLikeError(err)) {
      const fallbackResult = await fetchStatusWithBackgroundFallback(username, err);
      if (fallbackResult) {
        const enrichedFallbackResult = await enrichResultWithProfileImage(
          username,
          fallbackResult,
          member.profileImageUrl
        );
        console.log(`[LFS] ${username}: status=${enrichedFallbackResult.status} (background fallback after HTML block)`);
        if (!canUseStatusResult(enrichedFallbackResult, options)) {
          partialResult = partialResult
            ? mergeActionIdentifierResult(partialResult, enrichedFallbackResult)
            : enrichedFallbackResult;
        } else {
          cacheResolvedStatus(username, enrichedFallbackResult);
          return enrichedFallbackResult;
        }
      }
    }
    console.warn(`[LFS] HTML fetch failed for ${username}:`, err);
  }

  if (partialResult) {
    cacheResolvedStatus(username, partialResult);
    if (options.requireActionIdentifiers && partialResult.status !== 'unavailable') {
      throw new Error('Could not resolve LinkedIn relationship action identifiers');
    }
    return partialResult;
  }

  console.log(`[LFS] ${username}: unresolved after all sources`);
  throw new Error('Could not resolve relationship status');
}

export async function fetchLinkedInRelationshipStatus(
  member: FeedMemberInfo,
  options: FetchRelationshipStatusOptions = {}
): Promise<RelationshipStatusResult> {
  const username = await ensureCanonicalIdentity(member);

  const cached = getCachedStatus(username);
  const cachedHasRequiredIdentifiers =
    !options.requireActionIdentifiers || Boolean(cached?.profileUrn && cached.memberNumericId);
  if (
    cached &&
    cachedHasRequiredIdentifiers &&
    (isUsableProfileImageUrl(cached.profileImageUrl) || isUsableProfileImageUrl(member.profileImageUrl))
  ) {
    return normalizeRelationshipResolution({
      status: cached.status,
      profileUrn: cached.profileUrn,
      canMessage: cached.canMessage,
      canFollow: cached.canFollow,
      canConnect: cached.canConnect,
      isFollowing: cached.isFollowing,
      memberNumericId: cached.memberNumericId,
      isPremium: cached.isPremium,
      profileImageUrl: isUsableProfileImageUrl(cached.profileImageUrl) ? cached.profileImageUrl : member.profileImageUrl,
    });
  }

  return fetchSingleStatus(member, options);
}

export async function fetchStatusesProgressively(
  members: FeedMemberInfo[],
  onUpdate: (member: FeedMemberInfo) => void,
  signal?: AbortSignal
): Promise<void> {
  let nextIndex = 0;

  const processMember = async (member: FeedMemberInfo): Promise<void> => {
    if (signal?.aborted) return;

    let canonicalUsername = '';
    try {
      canonicalUsername = await ensureCanonicalIdentity(member);
    } catch {
      member.status = 'connect';
      onUpdate(member);
      return;
    }

    const cached = getCachedStatus(canonicalUsername);
    if (cached && (isUsableProfileImageUrl(cached.profileImageUrl) || isUsableProfileImageUrl(member.profileImageUrl))) {
      applyRelationshipResultToMember(member, {
        status: cached.status,
        profileUrn: cached.profileUrn,
        canMessage: cached.canMessage,
        canFollow: cached.canFollow,
        canConnect: cached.canConnect,
        isFollowing: cached.isFollowing,
        memberNumericId: cached.memberNumericId,
        isPremium: cached.isPremium,
        profileImageUrl: isUsableProfileImageUrl(cached.profileImageUrl) ? cached.profileImageUrl : member.profileImageUrl,
      });
      onUpdate(member);
      return;
    }

    try {
      const result = await fetchSingleStatus(member);
      applyRelationshipResultToMember(member, result);
    } catch {
      member.status = undefined;
      member.canMessage = undefined;
      member.canFollow = undefined;
      member.canConnect = undefined;
      member.isFollowing = undefined;
    }

    onUpdate(member);

    if (!signal?.aborted) {
      await delay(REQUEST_DELAY_MS);
    }
  };

  const worker = async (): Promise<void> => {
    while (!signal?.aborted) {
      const currentIndex = nextIndex++;
      if (currentIndex >= members.length) {
        return;
      }

      await processMember(members[currentIndex]);
    }
  };

  const workerCount = Math.min(STATUS_FETCH_CONCURRENCY, Math.max(members.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

export {
  clearStatusCache,
  invalidateCacheForUser,
  resolveProfileUrn,
  sendLinkedInConnectRequest,
  sendLinkedInFollowState,
};
