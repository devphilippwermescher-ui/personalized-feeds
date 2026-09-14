import { upsertProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsProfileSnapshot, ProfileAnalyticsSnapshot } from 'shared/types';
import { markTrackedConnectionsAccepted } from '../connection-invites/services/lifecycle';
import { fetchLinkedInConnectionsSnapshot, type LinkedInConnectionsSnapshot } from '../connections/api/connections-api';
import { fetchFollowersAnalyticsFromLinkedInTab } from './api/followers-analytics-api';
import { getLinkedInCsrfToken } from '../../platform/linkedin/csrf-token';
import type { ProfileAnalyticsConnectionCatchUpCheckpoint } from './profile-analytics-sync-policy';

const LIGHT_CONNECTION_PAGE_LIMIT = 3;
const CONNECTIONS_SOURCE_URL = 'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections';

export interface NetworkMetricResult {
  collected: boolean;
  changed: boolean;
  value?: number;
  sourceUrl?: string;
  error?: string;
  repairNeeded?: boolean;
}

export interface ProfileNetworkMetricsSyncResult {
  snapshot: ProfileAnalyticsSnapshot;
  connections: NetworkMetricResult;
  followers: NetworkMetricResult;
  connectionCatchUpCheckpoint?: ProfileAnalyticsConnectionCatchUpCheckpoint;
}

function valuesChanged(current: ProfileAnalyticsProfileSnapshot, next: ProfileAnalyticsProfileSnapshot): boolean {
  return (
    current.connectionsCount !== next.connectionsCount ||
    current.connectionsCountExact !== next.connectionsCountExact ||
    current.connectionsCountUpdatedAt !== next.connectionsCountUpdatedAt ||
    current.connectionsCountSource !== next.connectionsCountSource ||
    current.connectionDateCountsComplete !== next.connectionDateCountsComplete ||
    JSON.stringify(current.connectionDateCounts || {}) !== JSON.stringify(next.connectionDateCounts || {}) ||
    current.followersCount !== next.followersCount ||
    current.followersCountExact !== next.followersCountExact ||
    JSON.stringify(current.recentConnectionIds || []) !== JSON.stringify(next.recentConnectionIds || []) ||
    current.connectionIncrementalStatus !== next.connectionIncrementalStatus ||
    current.connectionIncrementalLastGapAt !== next.connectionIncrementalLastGapAt ||
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
  connectionCatchUpCheckpoint,
  collectedAt = Date.now(),
}: {
  userId: string;
  linkedInTabIds: number[];
  currentSnapshot: ProfileAnalyticsSnapshot;
  connectionCatchUpCheckpoint?: ProfileAnalyticsConnectionCatchUpCheckpoint;
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
      knownConnectionIds: connectionCatchUpCheckpoint?.boundaryConnectionIds || currentProfile.recentConnectionIds,
      maxPages: LIGHT_CONNECTION_PAGE_LIMIT,
      startIndex: connectionCatchUpCheckpoint?.nextStartIndex,
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
  let connectionCatchUpNeeded = false;
  let nextCatchUpCheckpoint: ProfileAnalyticsConnectionCatchUpCheckpoint | undefined;
  if (connectionsCollected) {
    const checkpointMatchesTotal =
      !connectionCatchUpCheckpoint ||
      connectionCatchUpCheckpoint.expectedTotal === connectionsSnapshot.connectionsCount;
    const connectionDatesById = checkpointMatchesTotal
      ? { ...(connectionCatchUpCheckpoint?.connectionDatesById || {}) }
      : {};
    if (checkpointMatchesTotal) {
      (connectionsSnapshot.connectionRecords || []).forEach((record) => {
        connectionDatesById[record.id] = record.connectedDate;
      });
    }
    const newDateCounts = Object.values(connectionDatesById).reduce<Record<string, number>>((counts, date) => {
      counts[date] = (counts[date] || 0) + 1;
      return counts;
    }, {});
    const hasKnownBoundary = currentProfile.recentConnectionIds && currentProfile.recentConnectionIds.length > 0;
    const incrementalReliable = Boolean(
      checkpointMatchesTotal && hasKnownBoundary && connectionsSnapshot.boundaryFound
    );
    const nextDateCounts = { ...(currentProfile.connectionDateCounts || {}) };
    if (incrementalReliable) {
      Object.entries(newDateCounts).forEach(([date, count]) => {
        nextDateCounts[date] = (nextDateCounts[date] || 0) + count;
      });
    }
    connectionCatchUpNeeded = Boolean(
      hasKnownBoundary && (!checkpointMatchesTotal || !connectionsSnapshot.boundaryFound)
    );
    if (connectionCatchUpNeeded && connectionsSnapshot.paginationComplete !== true) {
      nextCatchUpCheckpoint = {
        version: 1,
        expectedTotal: connectionsSnapshot.connectionsCount!,
        nextStartIndex: checkpointMatchesTotal ? connectionsSnapshot.nextStartIndex || 0 : 0,
        connectionDatesById: checkpointMatchesTotal ? connectionDatesById : {},
        boundaryConnectionIds:
          connectionCatchUpCheckpoint?.boundaryConnectionIds || currentProfile.recentConnectionIds || [],
        recentConnectionIds: checkpointMatchesTotal
          ? connectionCatchUpCheckpoint?.recentConnectionIds || connectionsSnapshot.recentConnectionIds || []
          : connectionsSnapshot.recentConnectionIds || [],
        lastAttemptAt: collectedAt,
      };
    }
    nextProfile = {
      ...nextProfile,
      connectionsCount: connectionsSnapshot.connectionsCount,
      connectionsCountExact: connectionsSnapshot.connectionsCountExact === true,
      connectionsCountUpdatedAt: collectedAt,
      connectionsCountSource: 'connections_rsc',
      ...(incrementalReliable
        ? {
            connectionDateCounts: nextDateCounts,
            connectionDateCountsUpdatedAt: collectedAt,
          }
        : {}),
      // A light sync never invalidates the immutable one-time baseline. If it
      // cannot reach the known boundary, a separate incremental catch-up is
      // marked pending instead of scheduling another full-history crawl.
      connectionIncrementalStatus: connectionCatchUpNeeded ? 'catch_up_pending' : 'current',
      ...(connectionCatchUpNeeded ? { connectionIncrementalLastGapAt: collectedAt } : {}),
      recentConnectionIds:
        incrementalReliable &&
        (connectionCatchUpCheckpoint?.recentConnectionIds || connectionsSnapshot.recentConnectionIds)?.length
          ? Array.from(
              new Set([
                ...(connectionCatchUpCheckpoint?.recentConnectionIds || connectionsSnapshot.recentConnectionIds || []),
                ...(currentProfile.recentConnectionIds || []),
              ])
            ).slice(0, 100)
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
      repairNeeded: connectionCatchUpNeeded,
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
    connectionCatchUpCheckpoint: nextCatchUpCheckpoint,
  };
}
