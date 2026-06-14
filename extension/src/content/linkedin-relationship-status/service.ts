import type { FeedMemberInfo } from '../feeds-sidebar/types';
import { getCanonicalLinkedInUsername } from '../../../../shared/linkedin-identity';
import { cacheCanonicalUsername, cacheStatus, clearStatusCache, getCachedCanonicalUsername, getCachedStatus, invalidateCacheForUser } from './cache';
import { GRAPHQL_QUERY_IDS, REQUEST_DELAY_MS, STATUS_FETCH_CONCURRENCY } from './constants';
import { fetchProfileImageFromProfilePage, fetchStatusFromProfilePage, fetchWithGraphQL, isLikelyLinkedInProfileToken, resolveCanonicalLinkedInIdentity, resolveProfileUrn, sendLinkedInConnectRequest, sendLinkedInFollowState } from './api';
import { delay, normalizeRelationshipResolution } from './utils';
import type { RelationshipResolution } from './types';

type RelationshipStatusResult = RelationshipResolution;

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

async function fetchSingleStatus(
  member: FeedMemberInfo
): Promise<RelationshipStatusResult> {
  const username = await ensureCanonicalIdentity(member);

  for (const queryId of GRAPHQL_QUERY_IDS) {
    try {
      const result = await fetchWithGraphQL(username, queryId);
      if (result) {
        const enrichedResult = normalizeRelationshipResolution(
          await enrichResultWithProfileImage(username, result, member.profileImageUrl)
        );
        console.log(`[LFS] ${username}: status=${enrichedResult.status} isPremium=${enrichedResult.isPremium ?? false} (GraphQL ${queryId.slice(-8)})`);
        cacheStatus(
          username,
          enrichedResult.status,
          enrichedResult.profileUrn,
          enrichedResult.canMessage,
          enrichedResult.canFollow,
          enrichedResult.canConnect,
          enrichedResult.isFollowing,
          enrichedResult.memberNumericId,
          enrichedResult.isPremium,
          enrichedResult.profileImageUrl
        );
        return enrichedResult;
      }
    } catch {
      // try next queryId
    }
  }

  try {
    const htmlResult = await fetchStatusFromProfilePage(username);
    if (htmlResult) {
      const normalizedHtmlResult = normalizeRelationshipResolution(htmlResult);
      cacheStatus(
        username,
        normalizedHtmlResult.status,
        normalizedHtmlResult.profileUrn,
        normalizedHtmlResult.canMessage,
        normalizedHtmlResult.canFollow,
        normalizedHtmlResult.canConnect,
        normalizedHtmlResult.isFollowing,
        normalizedHtmlResult.memberNumericId,
        normalizedHtmlResult.isPremium,
        normalizedHtmlResult.profileImageUrl
      );
      return normalizedHtmlResult;
    }
  } catch (err) {
    console.warn(`[LFS] HTML fetch failed for ${username}:`, err);
  }

  console.log(`[LFS] ${username}: unresolved after all sources`);
  throw new Error('Could not resolve relationship status');
}

export async function fetchLinkedInRelationshipStatus(
  member: FeedMemberInfo
): Promise<RelationshipStatusResult> {
  const username = await ensureCanonicalIdentity(member);

  const cached = getCachedStatus(username);
  if (cached && (isUsableProfileImageUrl(cached.profileImageUrl) || isUsableProfileImageUrl(member.profileImageUrl))) {
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

  return fetchSingleStatus(member);
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
      member.status = cached.status;
      member.profileUrn = cached.profileUrn;
      member.canMessage = cached.status === 'connected' ? true : cached.canMessage;
      member.canFollow = cached.canFollow;
      member.canConnect = cached.canConnect;
      member.isFollowing = cached.isFollowing;
      member.memberNumericId = cached.memberNumericId;
      member.isPremium = cached.isPremium;
      member.profileImageUrl = isUsableProfileImageUrl(cached.profileImageUrl) ? cached.profileImageUrl : member.profileImageUrl;
      onUpdate(member);
      return;
    }

    try {
      const result = await fetchSingleStatus(member);
      member.status = result.status;
      member.profileUrn = result.profileUrn;
      member.canMessage = result.canMessage;
      member.canFollow = result.canFollow;
      member.canConnect = result.canConnect;
      member.isFollowing = result.isFollowing;
      member.memberNumericId = result.memberNumericId;
      member.isPremium = result.isPremium;
      member.profileImageUrl = result.profileImageUrl || member.profileImageUrl;
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
