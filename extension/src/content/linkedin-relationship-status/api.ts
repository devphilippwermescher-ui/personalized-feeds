import { GRAPHQL_QUERY_IDS } from './constants';
import { parseGraphQLRelationshipStatus, parseProfileImageUrlFromHtml, parseStatusFromCodeBlocks, parseStatusFromRegex, parseStatusFromRehydration } from './parsers';
import { isLinkedInBlockedOrChallengeHtml, isLinkedInProfileUnavailableHtml } from './profile-page-state';
import { decodeHtmlEntities, getCsrfToken } from './utils';
import type { RelationshipResolution } from './types';
import { getUsernameFromLinkedInUrl, normalizeLinkedInUsername } from '../../../../shared/linkedin-identity';
import {
  getLinkedInStatusFetchErrorCode,
  LinkedInStatusFetchError,
} from './errors';

/**
 * Usernames stored in Firestore may already be percent-encoded
 * (e.g. "karen-w%C3%BCst"). Calling encodeURIComponent on them again
 * produces double-encoded URLs ("karen-w%25C3%25BCst") that LinkedIn
 * does not recognise, returning a generic error page instead of the
 * real profile. Decode first so we always get exactly one level of
 * encoding in the final URL.
 */
function safeEncodeUsername(username: string): string {
  let decoded = username;
  try { decoded = decodeURIComponent(username); } catch { /* keep original */ }
  return encodeURIComponent(decoded);
}

function buildLinkedInProfileUrl(username: string): string {
  return `https://www.linkedin.com/in/${safeEncodeUsername(username)}/`;
}

function matchGroup(text: string, regex: RegExp): string {
  const match = text.match(regex);
  return match?.[1] || '';
}

function extractCanonicalUsernameFromHtml(html: string, finalUrl?: string | null): string {
  const decodedHtml = decodeHtmlEntities(html);
  const finalUrlUsername = finalUrl ? getUsernameFromLinkedInUrl(finalUrl) : '';
  const candidates = [
    matchGroup(html, /"initialPath":"\/in\/([^/"?]+)\/"/),
    matchGroup(html, /\\"initialPath\\":\\"\/in\/([^/"?]+)\/\\"/),
    matchGroup(decodedHtml, /"initialPath":"\/in\/([^/"?]+)\/"/),
    matchGroup(decodedHtml, /\\"initialPath\\":\\"\/in\/([^/"?]+)\/\\"/),
    matchGroup(html, /"vanityName":"([^"]+)"/),
    matchGroup(html, /\\"vanityName\\":\\"([^\\"]+)\\"/),
    matchGroup(decodedHtml, /"vanityName":"([^"]+)"/),
    matchGroup(decodedHtml, /\\"vanityName\\":\\"([^\\"]+)\\"/),
    matchGroup(html, /https:\/\/www\.linkedin\.com\/in\/([^/"?\\]+)(?:\/|\\")/),
    matchGroup(decodedHtml, /https:\/\/www\.linkedin\.com\/in\/([^/"?\\]+)(?:\/|\\")/),
    finalUrlUsername,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLinkedInUsername(candidate);
    if (!normalized) {
      continue;
    }

    if (isLikelyLinkedInProfileToken(normalized) && normalized === normalizeLinkedInUsername(finalUrlUsername)) {
      continue;
    }

    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function buildCanonicalLinkedInUrl(username: string): string {
  return `https://www.linkedin.com/in/${safeEncodeUsername(username)}/`;
}

export function isLikelyLinkedInProfileToken(username: string): boolean {
  return /^ACo[A-Za-z0-9_-]+$/i.test(username.trim());
}

export async function resolveCanonicalLinkedInIdentity(
  urlOrUsername: string,
  fallbackUsername?: string
): Promise<{ username: string; linkedinUrl: string } | null> {
  const trimmedInput = urlOrUsername.trim();
  const trimmedFallback = fallbackUsername?.trim() || '';
  const requestUrl = /^https?:\/\//i.test(trimmedInput)
    ? trimmedInput
    : buildLinkedInProfileUrl(trimmedInput || trimmedFallback);

  if (!requestUrl) {
    return null;
  }

  const response = await fetch(requestUrl, {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const canonicalUsername = extractCanonicalUsernameFromHtml(html, response.url || requestUrl);
  if (!canonicalUsername) {
    return null;
  }

  return {
    username: canonicalUsername,
    linkedinUrl: buildCanonicalLinkedInUrl(canonicalUsername),
  };
}

export async function fetchStatusFromProfilePage(
  username: string,
  targetProfileUrn?: string
): Promise<RelationshipResolution | null> {
  const url = buildLinkedInProfileUrl(username);

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    const code = getLinkedInStatusFetchErrorCode(response.status);
    if (code !== 'api_error') {
      throw new LinkedInStatusFetchError(
        `LinkedIn profile page request failed with ${response.status}`,
        code,
        response.status
      );
    }
    return null;
  }

  const html = await response.text();
  const decodedHtml = decodeHtmlEntities(html);
  const withProfileImageUrl = (result: RelationshipResolution): RelationshipResolution => ({
    ...result,
    profileImageUrl: result.profileImageUrl || parseProfileImageUrlFromHtml(html, targetProfileUrn || result.profileUrn),
  });
  const ctaPreview = Array.from(
    new Set((decodedHtml.match(/aria-label="[^"]{1,160}"/g) || []).slice(0, 20))
  );
  const htmlSignals = {
    hasMessageCta: /aria-label="Message [^"]+"/i.test(decodedHtml) || />\s*Message\s*</i.test(decodedHtml),
    hasConnectCta:
      /aria-label="Invite [^"]+ to connect"/i.test(decodedHtml) ||
      /aria-label="Connect[^"]*"/i.test(decodedHtml) ||
      />\s*Connect\s*</i.test(decodedHtml),
    hasPendingCta:
      /aria-label="Pending[^"]*withdraw invitation/i.test(decodedHtml) ||
      />\s*Pending\s*</i.test(decodedHtml),
    hasFirstDegree:
      />\s*1st\s*</i.test(decodedHtml) ||
      /1st degree connection/i.test(decodedHtml),
    hasSecondOrThirdDegree:
      />\s*2nd\s*</i.test(decodedHtml) ||
      />\s*3rd\s*</i.test(decodedHtml) ||
      /2nd degree connection/i.test(decodedHtml) ||
      /3rd degree connection/i.test(decodedHtml),
    ctaPreview,
  };

  if (isLinkedInBlockedOrChallengeHtml(html)) {
    console.warn(`[LFS] ${username}: LinkedIn profile page appears blocked/challenged`, htmlSignals);
    throw new LinkedInStatusFetchError(
      'LinkedIn profile page appears blocked or challenged',
      'blocked'
    );
  }

  if (isLinkedInProfileUnavailableHtml(html)) {
    console.log(`[LFS] ${username}: profile unavailable (LinkedIn 404 page)`, htmlSignals);
    return {
      status: 'unavailable',
      canMessage: false,
      canFollow: false,
      canConnect: false,
      isFollowing: false,
    };
  }

  const rehydrationResult = parseStatusFromRehydration(html);
  if (rehydrationResult) {
    console.log(`[LFS] ${username}: status=${rehydrationResult.status} (from __como_rehydration__)`, htmlSignals);
    return withProfileImageUrl(rehydrationResult);
  }

  const jsonResult = parseStatusFromCodeBlocks(html);
  if (jsonResult) {
    console.log(`[LFS] ${username}: status=${jsonResult.status} (from code blocks)`, htmlSignals);
    return withProfileImageUrl(jsonResult);
  }

  const regexResult = parseStatusFromRegex(html);
  if (regexResult) {
    console.log(`[LFS] ${username}: status=${regexResult.status} (from regex: ${regexResult.reason})`, htmlSignals);
    return withProfileImageUrl(regexResult);
  }

  console.log(`[LFS] ${username}: no status found in HTML`, htmlSignals);
  return null;
}

export async function fetchProfileImageFromProfilePage(
  username: string,
  targetProfileUrn?: string
): Promise<string> {
  const url = buildLinkedInProfileUrl(username);

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    return '';
  }

  const html = await response.text();
  const profileImageUrl = parseProfileImageUrlFromHtml(html, targetProfileUrn);
  console.log(`[LFS] ${username}: profile image ${profileImageUrl ? 'found' : 'not found'} (HTML fallback)`);
  return profileImageUrl;
}

export async function fetchWithGraphQL(
  username: string,
  queryId: string
): Promise<RelationshipResolution | null> {
  const url =
    `https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true` +
    `&variables=(vanityName:${safeEncodeUsername(username)})` +
    `&queryId=${queryId}`;

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
      'csrf-token': getCsrfToken(),
      'x-restli-protocol-version': '2.0.0',
    },
  });

  if (!response.ok) {
    const code = getLinkedInStatusFetchErrorCode(response.status);
    if (code !== 'api_error') {
      throw new LinkedInStatusFetchError(
        `LinkedIn GraphQL request failed with ${response.status}`,
        code,
        response.status
      );
    }
    return null;
  }

  const payload = await response.json();
  return parseGraphQLRelationshipStatus(payload);
}

export async function resolveProfileUrn(username: string): Promise<string | null> {
  const url = buildLinkedInProfileUrl(username);
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) return null;

  const html = await response.text();
  const decoded = decodeHtmlEntities(html);
  const match = decoded.match(/urn:li:fsd_profile:[A-Za-z0-9_-]+/);
  console.log(`[LFS] resolveProfileUrn(${username}): ${match?.[0] ?? 'not found'}`);
  return match?.[0] ?? null;
}

function extractProfileToken(profileUrn: string): string | null {
  const match = profileUrn.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
}

export async function sendLinkedInConnectRequest(profileUrn: string): Promise<void> {
  const response = await fetch(
    'https://www.linkedin.com/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'content-type': 'application/json; charset=UTF-8',
        'csrf-token': getCsrfToken(),
        'x-restli-protocol-version': '2.0.0',
      },
      body: JSON.stringify({
        invitee: {
          inviteeUnion: {
            memberProfile: profileUrn,
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Failed to send connect request: ${response.status}${body ? ` ${body.slice(0, 500)}` : ''}`
    );
  }
}

export async function sendLinkedInFollowState(
  memberNumericId: string,
  profileUrn: string,
  vanityName: string,
  shouldFollow: boolean
): Promise<void> {
  const profileId = extractProfileToken(profileUrn);
  if (!profileId) {
    throw new Error('Could not resolve LinkedIn profile ID for follow action');
  }

  let normalizedVanityName = vanityName.trim();
  try { normalizedVanityName = decodeURIComponent(normalizedVanityName); } catch { /* keep original */ }
  if (!normalizedVanityName) {
    throw new Error('LinkedIn username is required for follow action');
  }

  const response = await fetch(
    'https://www.linkedin.com/flagship-web/rsc-action/actions/server-request?sduiid=com.linkedin.sdui.requests.mynetwork.addaUpdateFollowState',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        'csrf-token': getCsrfToken(),
      },
      body: JSON.stringify({
        requestId: 'com.linkedin.sdui.requests.mynetwork.addaUpdateFollowState',
        serverRequest: {
          requestId: 'com.linkedin.sdui.requests.mynetwork.addaUpdateFollowState',
          requestedArguments: {
            $type: 'proto.sdui.actions.requests.RequestedArguments',
            payload: {
              followStateType: shouldFollow ? 'FollowStateType_FOLLOW_ACTIVE' : 'FollowStateType_UNFOLLOW',
              memberUrn: {
                memberId: memberNumericId,
              },
              postActionSentConfigs: [
                {
                  type: 'VerificationNbaArgs',
                  value: {
                    entryPoint: 66,
                    redirectUri: `https://www.linkedin.com/in/${encodeURIComponent(normalizedVanityName)}`,
                  },
                },
                {
                  type: 'ProfileReplaceableSectionArgs',
                  value: {
                    data: {
                      profileId,
                      vanityName: normalizedVanityName,
                    },
                  },
                },
                {
                  type: 'ProfileDiscoveryDrawerArgs',
                  value: {
                    data: {
                      vanityName: normalizedVanityName,
                      nonIterableProfileId: profileId,
                    },
                  },
                },
              ],
            },
            requestedStateKeys: [],
            requestMetadata: {
              $type: 'proto.sdui.common.RequestMetadata',
            },
          },
          isStreaming: false,
          rumPageKey: '',
          isApfcEnabled: false,
        },
        states: [],
        requestedArguments: {
          $type: 'proto.sdui.actions.requests.RequestedArguments',
          payload: {
            followStateType: shouldFollow ? 'FollowStateType_FOLLOW_ACTIVE' : 'FollowStateType_UNFOLLOW',
            memberUrn: {
              memberId: memberNumericId,
            },
            postActionSentConfigs: [
              {
                type: 'VerificationNbaArgs',
                value: {
                  entryPoint: 66,
                  redirectUri: `https://www.linkedin.com/in/${normalizedVanityName}`,
                },
              },
              {
                type: 'ProfileReplaceableSectionArgs',
                value: {
                  data: {
                    profileId,
                    vanityName: normalizedVanityName,
                  },
                },
              },
              {
                type: 'ProfileDiscoveryDrawerArgs',
                value: {
                  data: {
                    vanityName: normalizedVanityName,
                    nonIterableProfileId: profileId,
                  },
                },
              },
            ],
          },
          requestedStateKeys: [],
          requestMetadata: {
            $type: 'proto.sdui.common.RequestMetadata',
          },
          states: [],
          screenId: 'com.linkedin.sdui.flagshipnav.profile.Profile',
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to ${shouldFollow ? 'follow' : 'unfollow'} profile: ${response.status}`);
  }
}

export { GRAPHQL_QUERY_IDS };
