import { useMemo } from 'react';
import { buildConnectionInviteAcceptanceSnapshot } from 'shared/firestore-service';
import { endOfDay, startOfDay, type DateRange } from '../../../utils/date';
import {
  buildAcceptanceRatePoints,
  buildConnectionsFollowersPoints,
  buildDailyMetricPoints,
  buildProfileVisitorPoints,
  filterSnapshotsByRange,
  getLatestRangeValue,
} from '../utils/series';
import { useProfileAnalytics } from './useProfileAnalytics';

export function useProfileAnalyticsViewModel(userId: string, selectedDateRange: DateRange) {
  const analytics = useProfileAnalytics(userId);
  const profile = analytics.snapshot?.profile;
  const searchAppearances = analytics.snapshot?.searchAppearances;
  const socialSellingIndex = analytics.snapshot?.socialSellingIndex;
  const acceptanceRate = useMemo(
    () =>
      buildConnectionInviteAcceptanceSnapshot(
        analytics.connectionInvites,
        selectedDateRange.start.getTime(),
        selectedDateRange.end.getTime()
      ),
    [analytics.connectionInvites, selectedDateRange.end, selectedDateRange.start]
  );
  const today = startOfDay(new Date()).getTime();
  const includesToday = selectedDateRange.start.getTime() <= today && selectedDateRange.end.getTime() >= today;

  const filteredDailySnapshots = useMemo(
    () => filterSnapshotsByRange(analytics.dailySnapshots, selectedDateRange),
    [analytics.dailySnapshots, selectedDateRange]
  );
  const connectionsFollowersPoints = useMemo(
    () =>
      buildConnectionsFollowersPoints({
        snapshots: analytics.dailySnapshots,
        range: selectedDateRange,
        connectionDateCounts: profile?.connectionDateCounts,
        connectionDateCountsComplete: profile?.connectionDateCountsComplete,
        connectionDateCountsUpdatedAt: profile?.connectionDateCountsUpdatedAt,
        currentConnectionsCount: profile?.connectionsCount,
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
      profile?.followersCount,
      profile?.followersCountExact,
      profile?.followerGrowthByDate,
      selectedDateRange,
    ]
  );
  const connectionsInRange = [...connectionsFollowersPoints]
    .reverse()
    .find((point) => typeof point.connectionsCount === 'number')?.connectionsCount;
  const followersCurrentTotal = profile?.followersCount;
  const currentSearchAppearances = includesToday ? searchAppearances?.totalCount : undefined;
  const currentSocialSellingIndex = includesToday ? socialSellingIndex?.score : undefined;
  const acceptanceRatePoints = useMemo(
    () => buildAcceptanceRatePoints(analytics.connectionInvites, selectedDateRange),
    [analytics.connectionInvites, selectedDateRange]
  );
  const profileViewsPoints = useMemo(
    () => buildProfileVisitorPoints(analytics.profileViewers, selectedDateRange),
    [analytics.profileViewers, selectedDateRange]
  );
  const rangeStart = startOfDay(selectedDateRange.start).getTime();
  const rangeEnd = endOfDay(selectedDateRange.end).getTime();
  const profileViewsInRange = analytics.profileViewers.filter(
    (viewer) => viewer.firstSeenAt >= rangeStart && viewer.firstSeenAt <= rangeEnd
  ).length;
  const profileViewsTotal =
    analytics.profileViewers.length +
    (analytics.profileViewerSummary?.privateViewerCount || 0) +
    (analytics.profileViewerSummary?.recruiterViewerCount || 0);
  const searchAppearancesPoints = useMemo(
    () =>
      buildDailyMetricPoints({
        snapshots: analytics.dailySnapshots,
        range: selectedDateRange,
        dataKey: 'searchAppearancesCount',
        currentValue: currentSearchAppearances,
      }),
    [analytics.dailySnapshots, currentSearchAppearances, selectedDateRange]
  );
  const socialSellingIndexPoints = useMemo(
    () =>
      buildDailyMetricPoints({
        snapshots: analytics.dailySnapshots,
        range: selectedDateRange,
        dataKey: 'socialSellingIndexScore',
        currentValue: currentSocialSellingIndex,
      }),
    [analytics.dailySnapshots, currentSocialSellingIndex, selectedDateRange]
  );
  const searchAppearancesInRange =
    [...searchAppearancesPoints].reverse().find((point) => typeof point.value === 'number')?.value ??
    getLatestRangeValue(filteredDailySnapshots, 'searchAppearancesCount');
  const socialSellingIndexInRange =
    [...socialSellingIndexPoints].reverse().find((point) => typeof point.value === 'number')?.value ??
    getLatestRangeValue(filteredDailySnapshots, 'socialSellingIndexScore');

  return {
    ...analytics,
    profile,
    searchAppearances,
    socialSellingIndex,
    acceptanceRate,
    profileViewsInRange,
    profileViewsTotal,
    connectionsFollowersPoints,
    connectionsInRange,
    followersCurrentTotal,
    searchAppearancesInRange,
    socialSellingIndexInRange,
    acceptanceRatePoints,
    profileViewsPoints,
    searchAppearancesPoints,
    socialSellingIndexPoints,
  };
}
