import { useMemo } from 'react';
import { buildConnectionInviteAcceptanceSnapshot } from 'shared/firestore-service';
import { getDateKey, startOfDay, type DateRange } from '../../../utils/date';
import {
  buildAcceptanceRatePoints,
  buildConnectionsFollowersPoints,
  buildDailyMetricPoints,
  buildProfileVisitorPoints,
  filterSnapshotsByRange,
  getAllAnalyticsDateRange,
  getCumulativeMetricChangeInRange,
  getLatestRangeValue,
  sumDateCountsInRange,
} from '../utils/series';
import { useProfileAnalytics } from './useProfileAnalytics';

export function useProfileAnalyticsViewModel(userId: string, selectedDateRange: DateRange | null) {
  const analytics = useProfileAnalytics(userId);
  const profile = analytics.snapshot?.profile;
  const searchAppearances = analytics.snapshot?.searchAppearances;
  const socialSellingIndex = analytics.snapshot?.socialSellingIndex;
  const isTotalRange = selectedDateRange === null;
  const connectionHistoryStatus = profile?.connectionHistoryBootstrap?.status;
  const connectionHistoryLoading = connectionHistoryStatus === 'scheduled' || connectionHistoryStatus === 'running';
  const connectionHistoryNeedsRepair = connectionHistoryStatus === 'needs_repair';
  const effectiveDateRange = useMemo(
    () =>
      selectedDateRange ||
      getAllAnalyticsDateRange({
        snapshots: analytics.dailySnapshots,
        viewers: analytics.profileViewers,
        invites: analytics.connectionInvites,
        connectionDateCounts: profile?.connectionDateCounts,
        followerGrowthByDate: profile?.followerGrowthByDate,
      }),
    [
      analytics.connectionInvites,
      analytics.dailySnapshots,
      analytics.profileViewers,
      profile?.connectionDateCounts,
      profile?.followerGrowthByDate,
      selectedDateRange,
    ]
  );
  const acceptanceRate = useMemo(
    () =>
      buildConnectionInviteAcceptanceSnapshot(
        analytics.connectionInvites,
        effectiveDateRange.start.getTime(),
        effectiveDateRange.end.getTime()
      ),
    [analytics.connectionInvites, effectiveDateRange.end, effectiveDateRange.start]
  );
  const today = startOfDay(new Date()).getTime();
  const includesToday = effectiveDateRange.start.getTime() <= today && effectiveDateRange.end.getTime() >= today;

  const filteredDailySnapshots = useMemo(
    () => filterSnapshotsByRange(analytics.dailySnapshots, effectiveDateRange),
    [analytics.dailySnapshots, effectiveDateRange]
  );
  const connectionsFollowersPoints = useMemo(
    () =>
      buildConnectionsFollowersPoints({
        snapshots: analytics.dailySnapshots,
        range: effectiveDateRange,
        connectionDateCounts: profile?.connectionDateCounts,
        connectionDateCountsComplete: profile?.connectionDateCountsComplete,
        connectionDateCountsUpdatedAt: profile?.connectionDateCountsUpdatedAt,
        currentConnectionsCount: profile?.connectionsCount,
        currentConnectionsCountExact: profile?.connectionsCountExact,
        currentFollowersCount: profile?.followersCount,
        currentFollowersCountExact: profile?.followersCountExact,
        followerGrowthByDate: profile?.followerGrowthByDate,
      }),
    [
      analytics.dailySnapshots,
      profile?.connectionDateCounts,
      profile?.connectionDateCountsComplete,
      profile?.connectionDateCountsUpdatedAt,
      profile?.connectionsCount,
      profile?.connectionsCountExact,
      profile?.followersCount,
      profile?.followersCountExact,
      profile?.followerGrowthByDate,
      effectiveDateRange,
    ]
  );
  const connectionRangeCount = profile?.connectionDateCountsComplete
    ? sumDateCountsInRange(profile.connectionDateCounts, effectiveDateRange)
    : undefined;
  const followerGrowthStart = profile?.followerGrowthStartDate || '';
  const followerGrowthEnd = profile?.followerGrowthEndDate || '';
  const rangeStartKey = getDateKey(effectiveDateRange.start);
  const rangeEndKey = getDateKey(effectiveDateRange.end);
  const followerHistoryCoversRange =
    Boolean(followerGrowthStart && followerGrowthEnd) &&
    followerGrowthStart <= rangeStartKey &&
    followerGrowthEnd >= rangeEndKey;
  const followerRangeCount = followerHistoryCoversRange
    ? sumDateCountsInRange(profile?.followerGrowthByDate, effectiveDateRange)
    : (getCumulativeMetricChangeInRange({
        snapshots: analytics.dailySnapshots,
        range: effectiveDateRange,
        dataKey: 'followersCount',
        currentValue: profile?.followersCount,
      }) ?? sumDateCountsInRange(profile?.followerGrowthByDate, effectiveDateRange));
  const connectionsInRange = isTotalRange
    ? profile?.connectionsCountExact === true
      ? profile.connectionsCount
      : undefined
    : connectionRangeCount;
  const followersInRange = isTotalRange ? profile?.followersCount : followerRangeCount;
  const currentSearchAppearances = includesToday ? searchAppearances?.totalCount : undefined;
  const currentSocialSellingIndex = includesToday ? socialSellingIndex?.score : undefined;
  const acceptanceRatePoints = useMemo(
    () => buildAcceptanceRatePoints(analytics.connectionInvites, effectiveDateRange),
    [analytics.connectionInvites, effectiveDateRange]
  );
  const currentPrivateViewerCount = analytics.supportingDataLoaded
    ? (analytics.profileViewerSummary?.privateViewerCount ?? analytics.snapshot?.profileViews?.privateCount ?? 0)
    : (analytics.snapshot?.profileViews?.privateCount ?? 0);
  const currentVisibleViewerCount = analytics.supportingDataLoaded
    ? analytics.profileViewers.length
    : (analytics.snapshot?.profileViews?.visibleCount ?? 0);
  const profileViewsPoints = useMemo(
    () =>
      buildProfileVisitorPoints({
        viewers: analytics.profileViewers,
        snapshots: analytics.dailySnapshots,
        range: effectiveDateRange,
        currentPrivateCount: currentPrivateViewerCount,
      }),
    [analytics.dailySnapshots, analytics.profileViewers, currentPrivateViewerCount, effectiveDateRange]
  );
  const profileViewsTotal = currentVisibleViewerCount + currentPrivateViewerCount;
  const profileViewsInRange = isTotalRange
    ? profileViewsTotal
    : [...profileViewsPoints].reverse().find((point) => typeof point.value === 'number')?.value;
  const searchAppearancesPoints = useMemo(
    () =>
      buildDailyMetricPoints({
        snapshots: analytics.dailySnapshots,
        range: effectiveDateRange,
        dataKey: 'searchAppearancesCount',
        currentValue: currentSearchAppearances,
      }),
    [analytics.dailySnapshots, currentSearchAppearances, effectiveDateRange]
  );
  const socialSellingIndexPoints = useMemo(
    () =>
      buildDailyMetricPoints({
        snapshots: analytics.dailySnapshots,
        range: effectiveDateRange,
        dataKey: 'socialSellingIndexScore',
        currentValue: currentSocialSellingIndex,
      }),
    [analytics.dailySnapshots, currentSocialSellingIndex, effectiveDateRange]
  );
  const searchAppearancesInRange = isTotalRange
    ? searchAppearances?.totalCount
    : ([...searchAppearancesPoints].reverse().find((point) => typeof point.value === 'number')?.value ??
      getLatestRangeValue(filteredDailySnapshots, 'searchAppearancesCount'));
  const socialSellingIndexInRange = isTotalRange
    ? socialSellingIndex?.score
    : ([...socialSellingIndexPoints].reverse().find((point) => typeof point.value === 'number')?.value ??
      getLatestRangeValue(filteredDailySnapshots, 'socialSellingIndexScore'));

  return {
    ...analytics,
    profile,
    searchAppearances,
    socialSellingIndex,
    acceptanceRate,
    isTotalRange,
    effectiveDateRange,
    profileViewsInRange,
    profileViewsTotal,
    connectionsFollowersPoints,
    connectionsInRange,
    followersInRange,
    searchAppearancesInRange,
    socialSellingIndexInRange,
    acceptanceRatePoints,
    profileViewsPoints,
    searchAppearancesPoints,
    socialSellingIndexPoints,
    connectionHistoryLoading,
    connectionHistoryNeedsRepair,
    connectionHistoryBootstrap: profile?.connectionHistoryBootstrap,
  };
}
