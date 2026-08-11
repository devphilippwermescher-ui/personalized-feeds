import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';
import { fetchWithTimeout } from './fetch-with-timeout';
import { fetchLinkedInConnectionsSnapshot } from './linkedin-connections-api';
import { collectFollowersInLinkedInPage, type LinkedInFollowersSnapshot } from './linkedin-followers-page-collector';
import { fetchFollowersAnalyticsFromLinkedInTab } from './linkedin-followers-analytics-api';
import { resolveLinkedInProfileIdentity } from './linkedin-profile-identity-resolver';
import { readLinkedInProfileMetadataFromExistingTab } from './linkedin-profile-metadata-page-collector';
import {
  extractFollowersCountFromGraphql,
  extractMiniProfile,
  profileSnapshotFromMiniProfile,
  profileSnapshotFromNetworkInfo,
  profileSnapshotFromProfileView,
} from './profile-analytics-linkedin-parser';
import { getLinkedInCsrfToken } from './profile-viewers-api-client';

export {
  extractConnectionsCountFromNetworkInfo,
  extractFollowersCountFromGraphql,
  extractFollowersCountFromNetworkInfo,
} from './profile-analytics-linkedin-parser';

export const LINKEDIN_ME_URL = 'https://www.linkedin.com/voyager/api/me';
const REQUEST_TIMEOUT_MS = 12_000;
const LINKEDIN_FOLLOWERS_QUERY_ID = 'voyagerSearchDashClusters.a7a0567fa66c52d645b5ff2f960b92aa';
const LINKEDIN_FOLLOWERS_VARIABLES =
  '(start:0,count:10,origin:CurationHub,query:(flagshipSearchIntent:MYNETWORK_CURATION_HUB,' +
  'includeFiltersInResponse:true,queryParameters:List((key:resultType,value:List(FOLLOWERS)))))';
const LINKEDIN_FOLLOWERS_URL =
  'https://www.linkedin.com/voyager/api/graphql?' +
  `variables=${encodeURIComponent(LINKEDIN_FOLLOWERS_VARIABLES)}` +
  `&queryId=${LINKEDIN_FOLLOWERS_QUERY_ID}`;

export type FollowersSyncSource =
  | 'linkedin-tab-audience-analytics'
  | 'linkedin-tab-graphql'
  | 'background-graphql'
  | 'network-info';

export interface LinkedInProfileAnalyticsResult {
  profile: ProfileAnalyticsProfileSnapshot;
  diagnostics: {
    connectionsExact: boolean;
    connectionsError?: string;
    followersSource: FollowersSyncSource;
    followersExact: boolean;
    followersQueryCount?: number;
    networkInfoFollowersCount?: number;
    followersTabError?: string;
  };
}

export async function fetchLinkedInJson(url: string, csrfToken: string): Promise<unknown | null> {
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
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    console.info('[profile-analytics] LinkedIn JSON endpoint returned non-OK status', {
      url,
      status: response.status,
    });
    if ([401, 403, 429, 999].includes(response.status)) {
      const error = new Error(`LinkedIn request was blocked with ${response.status}`) as Error & {
        httpStatus?: number;
      };
      error.httpStatus = response.status;
      throw error;
    }
    return null;
  }

  console.info('[profile-analytics] LinkedIn JSON endpoint fetched', { url, status: response.status });
  return response.json();
}

export function getProfileUrls(linkedinUsername: string) {
  const baseUrl = `https://www.linkedin.com/voyager/api/identity/profiles/${encodeURIComponent(linkedinUsername)}`;
  return {
    profile: baseUrl,
    profileView: `${baseUrl}/profileView`,
    networkInfo: `${baseUrl}/networkinfo`,
  };
}

async function fetchFollowersFromLinkedInTab(
  linkedInTabId: number | undefined,
  csrfToken: string
): Promise<LinkedInFollowersSnapshot | null> {
  if (typeof linkedInTabId !== 'number') return null;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: linkedInTabId },
      world: 'MAIN',
      func: collectFollowersInLinkedInPage,
      args: [csrfToken, LINKEDIN_FOLLOWERS_URL],
    });
    return results[0]?.result || null;
  } catch (error) {
    console.info('[profile-analytics] followers query could not run in the LinkedIn tab', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function fetchLinkedInMeProfileSnapshot(
  collectedAt: number,
  linkedInTabId?: number,
  options: {
    includeConnectionHistory?: boolean;
    knownConnectionIds?: string[];
    currentConnectionsCount?: number;
    currentFollowersCount?: number;
    currentFollowersCountExact?: boolean;
  } = {}
): Promise<LinkedInProfileAnalyticsResult | null> {
  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) return null;

  const mePayload = await fetchLinkedInJson(LINKEDIN_ME_URL, csrfToken);
  const miniProfile = extractMiniProfile(mePayload);
  if (!miniProfile) return null;

  const meSnapshot = profileSnapshotFromMiniProfile(miniProfile, collectedAt, LINKEDIN_ME_URL);
  if (!meSnapshot) return null;
  console.info('[profile-analytics] /voyager/api/me parsed profile fields', {
    linkedinUsername: meSnapshot.linkedinUsername,
    hasDisplayName: Boolean(meSnapshot.displayName),
    hasHeadline: Boolean(meSnapshot.headline),
    hasAvatar: Boolean(meSnapshot.profileImageUrl),
    hasBackground: Boolean(meSnapshot.backgroundImageUrl),
  });

  const urls = getProfileUrls(meSnapshot.linkedinUsername);
  // LinkedIn retired profileView for some accounts (410). The base profile
  // resource is the current source and contains geoLocationName when exposed.
  // Keep profileView only as a compatibility fallback for older accounts.
  const currentProfilePayload = await fetchLinkedInJson(urls.profile, csrfToken).catch(() => null);
  const legacyProfilePayload = currentProfilePayload
    ? null
    : await fetchLinkedInJson(urls.profileView, csrfToken).catch(() => null);
  const profilePayload = currentProfilePayload || legacyProfilePayload;
  const profileSourceUrl = currentProfilePayload ? urls.profile : urls.profileView;
  const profileViewSnapshot = profilePayload
    ? profileSnapshotFromProfileView(profilePayload, meSnapshot, collectedAt, profileSourceUrl)
    : meSnapshot;

  const networkInfoPayload = await fetchLinkedInJson(urls.networkInfo, csrfToken).catch(() => null);
  const networkInfoSnapshot = networkInfoPayload
    ? profileSnapshotFromNetworkInfo(networkInfoPayload, profileViewSnapshot, collectedAt, urls.networkInfo)
    : profileViewSnapshot;
  const profileIdentity = !networkInfoSnapshot.location
    ? await resolveLinkedInProfileIdentity(meSnapshot.linkedinUsername).catch((error) => {
        console.info('[profile-analytics] current GraphQL profile details were unavailable', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
    : null;
  const pageProfileMetadata =
    !networkInfoSnapshot.location && !profileIdentity?.location
      ? await readLinkedInProfileMetadataFromExistingTab(linkedInTabId, meSnapshot.linkedinUsername)
      : null;
  const fallbackLocation = profileIdentity?.location || pageProfileMetadata?.location;
  const resolvedProfileSnapshot: ProfileAnalyticsProfileSnapshot = fallbackLocation
    ? {
        ...networkInfoSnapshot,
        profileUrn: profileIdentity?.profileUrn || networkInfoSnapshot.profileUrn,
        location: fallbackLocation,
      }
    : networkInfoSnapshot;

  const networkInfoFollowersCount = resolvedProfileSnapshot.followersCount;
  let analyticsFollowersError: string | undefined;
  const analyticsFollowersSnapshot = await fetchFollowersAnalyticsFromLinkedInTab(
    linkedInTabId,
    csrfToken,
    collectedAt
  ).catch((error) => {
    analyticsFollowersError = error instanceof Error ? error.message : String(error);
    console.warn('[profile-analytics] precise follower total was unavailable', {
      error: analyticsFollowersError,
    });
    return null;
  });
  const tabFollowersSnapshot =
    typeof analyticsFollowersSnapshot?.followersCount === 'number'
      ? null
      : await fetchFollowersFromLinkedInTab(linkedInTabId, csrfToken);
  const followersPayload =
    typeof tabFollowersSnapshot?.followersCount === 'number'
      ? null
      : await fetchLinkedInJson(LINKEDIN_FOLLOWERS_URL, csrfToken).catch(() => null);
  const followersCount =
    analyticsFollowersSnapshot?.followersCount ??
    options.currentFollowersCount ??
    tabFollowersSnapshot?.followersCount ??
    extractFollowersCountFromGraphql(followersPayload) ??
    networkInfoFollowersCount;
  const connectionsSnapshot = await fetchLinkedInConnectionsSnapshot(csrfToken, linkedInTabId, {
    includeHistory: options.includeConnectionHistory,
    knownConnectionIds: options.knownConnectionIds,
  }).catch((error) => {
    console.info('[profile-analytics] connections RSC endpoint was unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  const followerDailyGrowth = analyticsFollowersSnapshot?.followerDailyGrowth || [];
  const followerGrowthByDate = Object.fromEntries(followerDailyGrowth.map((point) => [point.date, point.count]));

  const snapshot: ProfileAnalyticsProfileSnapshot = {
    ...resolvedProfileSnapshot,
    connectionsCount:
      connectionsSnapshot?.connectionsCount ??
      options.currentConnectionsCount ??
      resolvedProfileSnapshot.connectionsCount,
    connectionDateCounts: connectionsSnapshot?.connectionDateCounts,
    connectionDateCountsComplete: connectionsSnapshot?.connectionDateCountsComplete,
    connectionDateCountsUpdatedAt:
      options.includeConnectionHistory !== false && connectionsSnapshot ? collectedAt : undefined,
    // Only a full bootstrap/repair may replace the historical diagnostic.
    connectionDateCountsError:
      options.includeConnectionHistory !== false && connectionsSnapshot ? connectionsSnapshot.error || '' : undefined,
    recentConnectionIds: connectionsSnapshot?.recentConnectionIds,
    // Audience Analytics exposes LinkedIn's precise "Total followers" value.
    // The older Curation Hub and networkinfo totals remain fallbacks.
    followersCount: followersCount,
    followersCountExact:
      typeof analyticsFollowersSnapshot?.followersCount === 'number' ? true : options.currentFollowersCountExact,
    ...(followerDailyGrowth.length > 0
      ? {
          followerGrowthByDate,
          followerGrowthStartDate: followerDailyGrowth[0].date,
          followerGrowthEndDate: followerDailyGrowth[followerDailyGrowth.length - 1].date,
          followerGrowthUpdatedAt: collectedAt,
        }
      : {}),
    updatedAt: collectedAt,
  };
  console.info('[profile-analytics] profile detail parsed fields', {
    sourceUrl: snapshot.sourceUrl,
    location: snapshot.location,
    locationSource: profileViewSnapshot.location
      ? profileSourceUrl
      : networkInfoSnapshot.location
        ? urls.networkInfo
        : profileIdentity?.location
          ? 'voyagerIdentityDashProfiles'
          : pageProfileMetadata?.location
            ? pageProfileMetadata.pageUrl
            : undefined,
    connectionsCount: snapshot.connectionsCount,
    connectionDateCount: Object.values(snapshot.connectionDateCounts || {}).reduce((total, value) => total + value, 0),
    connectionDateCountsComplete: snapshot.connectionDateCountsComplete,
    connectionDateCountsError: snapshot.connectionDateCountsError,
    followersCount: snapshot.followersCount,
    followersSource:
      typeof analyticsFollowersSnapshot?.followersCount === 'number'
        ? 'linkedin-tab-audience-analytics'
        : typeof tabFollowersSnapshot?.followersCount === 'number'
          ? 'linkedin-tab-graphql'
          : typeof followersCount === 'number'
            ? LINKEDIN_FOLLOWERS_URL
            : urls.networkInfo,
    followersTabError: analyticsFollowersError || analyticsFollowersSnapshot?.error || tabFollowersSnapshot?.error,
  });
  return {
    profile: snapshot,
    diagnostics: {
      connectionsExact: typeof connectionsSnapshot?.connectionsCount === 'number',
      connectionsError: connectionsSnapshot?.error,
      followersSource:
        typeof analyticsFollowersSnapshot?.followersCount === 'number'
          ? 'linkedin-tab-audience-analytics'
          : typeof tabFollowersSnapshot?.followersCount === 'number'
            ? 'linkedin-tab-graphql'
            : typeof followersCount === 'number'
              ? 'background-graphql'
              : 'network-info',
      followersExact: typeof analyticsFollowersSnapshot?.followersCount === 'number',
      followersQueryCount: followersCount,
      networkInfoFollowersCount,
      followersTabError: analyticsFollowersError || analyticsFollowersSnapshot?.error || tabFollowersSnapshot?.error,
    },
  };
}
