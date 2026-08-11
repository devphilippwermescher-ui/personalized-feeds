import { upsertProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsProfileSnapshot, ProfileAnalyticsSnapshot } from 'shared/types';
import { markTrackedConnectionsAccepted } from './connection-invite-lifecycle';
import { fetchLinkedInConnectionsSnapshot, type LinkedInConnectionsSnapshot } from './linkedin-connections-api';
import { fetchFollowersAnalyticsFromLinkedInTab } from './linkedin-followers-analytics-api';
import { getLinkedInCsrfToken } from './profile-viewers-api-client';

const LIGHT_CONNECTION_PAGE_LIMIT = 3;
const CONNECTIONS_SOURCE_URL = 'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections';

export interface NetworkMetricResult {
  collected: boolean;
  changed: boolean;
  value?: number;
  sourceUrl?: string;
  error?: string;
}

export interface ProfileNetworkMetricsSyncResult {
  snapshot: ProfileAnalyticsSnapshot;
  connections: NetworkMetricResult;
  followers: NetworkMetricResult;
}

function valuesChanged(current: ProfileAnalyticsProfileSnapshot, next: ProfileAnalyticsProfileSnapshot): boolean {
  return (
    current.connectionsCount !== next.connectionsCount ||
    current.followersCount !== next.followersCount ||
    current.followersCountExact !== next.followersCountExact ||
    JSON.stringify(current.recentConnectionIds || []) !== JSON.stringify(next.recentConnectionIds || []) ||
    JSON.stringify(current.followerGrowthByDate || {}) !== JSON.stringify(next.followerGrowthByDate || {})
  );
}

/**
 * Refreshes only volatile network totals. Invitation acceptance has its own
 * bounded task so a slow profile-status request cannot delay exact totals.
 * It never fetches profile metadata and bounds incremental connection paging
 * at the first known id (with a three-page safety cap).
 */
export async function syncProfileNetworkMetrics({
  userId,
  linkedInTabIds,
  currentSnapshot,
  collectedAt = Date.now(),
}: {
  userId: string;
  linkedInTabIds: number[];
  currentSnapshot: ProfileAnalyticsSnapshot;
  collectedAt?: number;
}): Promise<ProfileNetworkMetricsSyncResult> {
  if (!currentSnapshot.profile) {
    throw new Error('Profile Analytics bootstrap is required before network totals can be synchronized.');
  }

  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new Error('LinkedIn authentication token is unavailable.');
  }

  const currentProfile = currentSnapshot.profile;
  let nextProfile = { ...currentProfile };

  let connectionsTabId: number | undefined;
  let connectionsSnapshot: LinkedInConnectionsSnapshot = {
    connectionDateCounts: {},
    connectionDateCountsComplete: false,
    error: 'No responsive LinkedIn tab was available for Connections.',
  };
  const connectionsStartedAt = Date.now();
  for (const linkedInTabId of linkedInTabIds) {
    console.info('[profile-analytics] Connections collector started', { linkedInTabId });
    const candidate = await fetchLinkedInConnectionsSnapshot(csrfToken, linkedInTabId, {
      includeHistory: false,
      knownConnectionIds: currentProfile.recentConnectionIds,
      maxPages: LIGHT_CONNECTION_PAGE_LIMIT,
    }).catch(
      (error): LinkedInConnectionsSnapshot => ({
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    connectionsSnapshot = candidate;
    console.info('[profile-analytics] Connections collector candidate finished', {
      linkedInTabId,
      collected: typeof candidate.connectionsCount === 'number',
      error: candidate.error,
    });
    if (typeof candidate.connectionsCount === 'number') {
      connectionsTabId = linkedInTabId;
      break;
    }
  }
  console.info('[profile-analytics] Connections collector finished', {
    durationMs: Date.now() - connectionsStartedAt,
    linkedInTabId: connectionsTabId,
    collected: typeof connectionsSnapshot.connectionsCount === 'number',
    error: connectionsSnapshot.error,
  });
  const connectionsCollected = typeof connectionsSnapshot.connectionsCount === 'number';
  if (connectionsCollected) {
    nextProfile = {
      ...nextProfile,
      connectionsCount: connectionsSnapshot.connectionsCount,
      recentConnectionIds:
        connectionsSnapshot.recentConnectionIds && connectionsSnapshot.recentConnectionIds.length > 0
          ? connectionsSnapshot.recentConnectionIds
          : currentProfile.recentConnectionIds,
    };
    if (connectionsSnapshot.recentConnectionIds?.length) {
      await markTrackedConnectionsAccepted(userId, connectionsSnapshot.recentConnectionIds, collectedAt);
    }
  }

  type FollowersSnapshot = NonNullable<Awaited<ReturnType<typeof fetchFollowersAnalyticsFromLinkedInTab>>>;
  const followerTabIds = connectionsTabId
    ? [connectionsTabId, ...linkedInTabIds.filter((tabId) => tabId !== connectionsTabId)]
    : linkedInTabIds;
  const followersStartedAt = Date.now();
  let followersTabId: number | undefined;
  let followersSnapshot: FollowersSnapshot | null = null;
  for (const linkedInTabId of followerTabIds) {
    console.info('[profile-analytics] Followers collector started', { linkedInTabId });
    const candidate = await fetchFollowersAnalyticsFromLinkedInTab(linkedInTabId, csrfToken, collectedAt).catch(
      (error): FollowersSnapshot => ({
        error: error instanceof Error ? error.message : String(error),
      })
    );
    followersSnapshot = candidate;
    console.info('[profile-analytics] Followers collector candidate finished', {
      linkedInTabId,
      collected: typeof candidate?.followersCount === 'number',
      error: candidate?.error,
    });
    if (typeof candidate?.followersCount === 'number') {
      followersTabId = linkedInTabId;
      break;
    }
  }
  console.info('[profile-analytics] Followers collector finished', {
    durationMs: Date.now() - followersStartedAt,
    linkedInTabId: followersTabId,
    collected: typeof followersSnapshot?.followersCount === 'number',
    error: followersSnapshot?.error,
  });
  const followersCollected = typeof followersSnapshot?.followersCount === 'number';
  if (followersCollected && followersSnapshot) {
    const followerDailyGrowth = followersSnapshot.followerDailyGrowth || [];
    nextProfile = {
      ...nextProfile,
      followersCount: followersSnapshot.followersCount,
      followersCountExact: true,
      ...(followerDailyGrowth.length > 0
        ? {
            followerGrowthByDate: Object.fromEntries(followerDailyGrowth.map((point) => [point.date, point.count])),
            followerGrowthStartDate: followerDailyGrowth[0].date,
            followerGrowthEndDate: followerDailyGrowth[followerDailyGrowth.length - 1].date,
            followerGrowthUpdatedAt: collectedAt,
          }
        : {}),
    };
  }

  const profileChanged = valuesChanged(currentProfile, nextProfile);
  const snapshot = profileChanged
    ? await upsertProfileAnalyticsSnapshot(
        userId,
        { profile: { ...nextProfile, updatedAt: collectedAt } },
        { updatedAt: collectedAt }
      )
    : currentSnapshot;

  return {
    snapshot,
    connections: {
      collected: connectionsCollected,
      changed: connectionsCollected && currentProfile.connectionsCount !== nextProfile.connectionsCount,
      value: nextProfile.connectionsCount,
      sourceUrl: CONNECTIONS_SOURCE_URL,
      ...(!connectionsCollected
        ? { error: connectionsSnapshot.error || 'LinkedIn did not return an exact Connections total.' }
        : {}),
    },
    followers: {
      collected: followersCollected,
      changed: followersCollected && currentProfile.followersCount !== nextProfile.followersCount,
      value: nextProfile.followersCount,
      sourceUrl: followersSnapshot?.sourceUrl,
      ...(!followersCollected
        ? { error: followersSnapshot?.error || 'LinkedIn did not return an exact Followers total.' }
        : {}),
    },
  };
}
