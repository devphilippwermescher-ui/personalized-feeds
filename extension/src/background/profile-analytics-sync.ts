import { getProfileAnalyticsSnapshot, upsertProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsProfileSnapshot, ProfileAnalyticsSnapshot } from 'shared/types';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { fetchLinkedInMeProfileSnapshot, type LinkedInProfileAnalyticsResult } from './profile-analytics-linkedin-api';
import { markTrackedConnectionsAccepted } from './connection-invite-lifecycle';
import { fetchSearchAppearancesSnapshot } from './profile-analytics-search-appearances-api';
import { SEARCH_APPEARANCES_SYNC_TTL_MS } from './profile-analytics-sync-policy';
import { hasProfileSnapshotChanged, hasSearchAppearancesChanged } from './profile-analytics-change-detector';

interface ProfileAnalyticsSyncOptions {
  preferredTabId?: number;
  currentSnapshot?: ProfileAnalyticsSnapshot | null;
  forceCurrentMetrics?: boolean;
}

function mergeProfileSnapshot(
  current: ProfileAnalyticsProfileSnapshot | undefined,
  next: ProfileAnalyticsProfileSnapshot
): ProfileAnalyticsProfileSnapshot {
  const refreshedConnectionHistory = typeof next.connectionDateCountsUpdatedAt === 'number';
  const shouldReplaceConnectionHistory = next.connectionDateCountsComplete === true || !current?.connectionDateCounts;
  const mergedConnectionDateCounts = shouldReplaceConnectionHistory
    ? next.connectionDateCounts
    : { ...current.connectionDateCounts };
  if (!shouldReplaceConnectionHistory && mergedConnectionDateCounts) {
    Object.entries(next.connectionDateCounts || {}).forEach(([date, count]) => {
      mergedConnectionDateCounts[date] = Math.max(mergedConnectionDateCounts[date] || 0, count);
    });
  }

  return {
    ...current,
    ...next,
    headline: next.headline || current?.headline,
    profileImageUrl: next.profileImageUrl || current?.profileImageUrl,
    backgroundImageUrl: next.backgroundImageUrl || current?.backgroundImageUrl,
    company: next.company || current?.company,
    location: next.location || current?.location,
    connectionsCount: next.connectionsCount ?? current?.connectionsCount,
    connectionsCountExact: next.connectionsCountExact ?? current?.connectionsCountExact,
    connectionsCountUpdatedAt: next.connectionsCountUpdatedAt ?? current?.connectionsCountUpdatedAt,
    connectionsCountSource: next.connectionsCountSource ?? current?.connectionsCountSource,
    connectionDateCounts: mergedConnectionDateCounts,
    connectionDateCountsComplete: refreshedConnectionHistory
      ? next.connectionDateCountsComplete
      : current?.connectionDateCountsComplete,
    connectionDateCountsUpdatedAt: refreshedConnectionHistory
      ? next.connectionDateCountsUpdatedAt
      : current?.connectionDateCountsUpdatedAt,
    connectionDateCountsError: refreshedConnectionHistory
      ? next.connectionDateCountsError
      : current?.connectionDateCountsError,
    connectionHistoryKind: next.connectionHistoryKind ?? current?.connectionHistoryKind,
    recentConnectionIds:
      next.recentConnectionIds && next.recentConnectionIds.length > 0
        ? next.recentConnectionIds
        : current?.recentConnectionIds,
    followersCount: next.followersCount ?? current?.followersCount,
    followersCountExact: next.followersCountExact ?? current?.followersCountExact,
    followerGrowthByDate:
      next.followerGrowthByDate && Object.keys(next.followerGrowthByDate).length > 0
        ? next.followerGrowthByDate
        : current?.followerGrowthByDate,
    followerGrowthStartDate: next.followerGrowthStartDate || current?.followerGrowthStartDate,
    followerGrowthEndDate: next.followerGrowthEndDate || current?.followerGrowthEndDate,
    followerGrowthUpdatedAt: next.followerGrowthUpdatedAt ?? current?.followerGrowthUpdatedAt,
  };
}

export async function syncProfileAnalyticsFromLinkedInTabs(options: ProfileAnalyticsSyncOptions = {}): Promise<{
  snapshot: ProfileAnalyticsSnapshot;
  collectedPages: string[];
  collected: {
    profile: boolean;
    searchAppearances: boolean;
    socialSellingIndex: boolean;
  };
  diagnostics: LinkedInProfileAnalyticsResult['diagnostics'];
}> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    throw new Error('myFeedPilot authentication is required before profile analytics can be synchronized.');
  }

  const currentSnapshot =
    options.currentSnapshot === undefined ? await getProfileAnalyticsSnapshot(user.uid) : options.currentSnapshot;
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  const linkedInTabs = tabs.filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number');
  const preferredTab = linkedInTabs.find((tab) => tab.id === options.preferredTabId);
  const activeLinkedInTab = preferredTab || linkedInTabs.find((tab) => tab.active) || linkedInTabs[0];
  const collectedAt = Date.now();
  const linkedInResult = await fetchLinkedInMeProfileSnapshot(collectedAt, activeLinkedInTab?.id, {
    includeConnectionHistory: false,
    knownConnectionIds: currentSnapshot?.profile?.recentConnectionIds,
    currentConnectionsCount: currentSnapshot?.profile?.connectionsCount,
    currentFollowersCount: currentSnapshot?.profile?.followersCount,
    currentFollowersCountExact: currentSnapshot?.profile?.followersCountExact,
  });
  if (!linkedInResult) {
    throw new Error('LinkedIn profile analytics request did not return profile data.');
  }
  const linkedInProfile = linkedInResult.profile;
  if (linkedInProfile.recentConnectionIds?.length) {
    await markTrackedConnectionsAccepted(user.uid, linkedInProfile.recentConnectionIds, collectedAt);
  }

  const profile = mergeProfileSnapshot(currentSnapshot?.profile, linkedInProfile);
  const shouldCollectSearchAppearances =
    options.forceCurrentMetrics === true ||
    typeof currentSnapshot?.searchAppearances?.updatedAt !== 'number' ||
    collectedAt - currentSnapshot.searchAppearances.updatedAt >= SEARCH_APPEARANCES_SYNC_TTL_MS;
  const searchAppearances = shouldCollectSearchAppearances
    ? await fetchSearchAppearancesSnapshot(collectedAt).catch((error) => {
        console.warn('[profile-analytics] Search Appearances collector failed independently', error);
        return null;
      })
    : null;
  const profileChanged = hasProfileSnapshotChanged(currentSnapshot?.profile, profile);
  const searchAppearancesChanged =
    searchAppearances !== null && hasSearchAppearancesChanged(currentSnapshot?.searchAppearances, searchAppearances);
  const nextSnapshot =
    profileChanged || searchAppearancesChanged || !currentSnapshot
      ? await upsertProfileAnalyticsSnapshot(
          user.uid,
          {
            ...(profileChanged ? { profile } : {}),
            ...(searchAppearancesChanged && searchAppearances ? { searchAppearances } : {}),
          },
          { updatedAt: collectedAt }
        )
      : currentSnapshot;

  console.info('[profile-analytics] current values verified', {
    profileChanged,
    searchAppearancesChanged,
    connectionsCount: profile.connectionsCount,
    followersCount: profile.followersCount,
  });

  if (!linkedInResult.diagnostics.connectionsExact || !linkedInResult.diagnostics.followersExact) {
    const missing = [
      !linkedInResult.diagnostics.connectionsExact ? 'exact Connections total' : '',
      !linkedInResult.diagnostics.followersExact ? 'exact Followers total' : '',
    ].filter(Boolean);
    throw new Error(`LinkedIn did not return ${missing.join(' and ')}; current Firestore values were preserved.`);
  }

  return {
    snapshot: nextSnapshot,
    collectedPages: [linkedInProfile.sourceUrl, ...(searchAppearances ? [searchAppearances.sourceUrl] : [])],
    collected: {
      profile: true,
      searchAppearances: Boolean(searchAppearances),
      socialSellingIndex: false,
    },
    diagnostics: linkedInResult.diagnostics,
  };
}
