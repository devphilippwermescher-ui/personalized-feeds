import { useMemo } from 'react';
import { buildConnectionInviteAcceptanceSnapshot } from 'shared/firestore-service';
import { startOfDay, type DateRange } from '../../../utils/date';
import {
  buildAcceptanceRatePoints,
  buildConnectionsFollowersPoints,
  buildDailyMetricPoints,
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
      }),
    [
      analytics.dailySnapshots,
      profile?.connectionDateCounts,
      profile?.connectionDateCountsComplete,
      profile?.connectionDateCountsUpdatedAt,
      profile?.connectionsCount,
      profile?.followersCount,
      selectedDateRange,
    ]
  );
  const connectionsInRange = [...connectionsFollowersPoints]
    .reverse()
    .find((point) => typeof point.connectionsCount === 'number')?.connectionsCount;
  const followersInRange = [...connectionsFollowersPoints]
    .reverse()
    .find((point) => typeof point.followersCount === 'number')?.followersCount;
  const searchAppearancesInRange =
    getLatestRangeValue(filteredDailySnapshots, 'searchAppearancesCount') ??
    (includesToday ? searchAppearances?.totalCount : undefined);
  const socialSellingIndexInRange =
    getLatestRangeValue(filteredDailySnapshots, 'socialSellingIndexScore') ??
    (includesToday ? socialSellingIndex?.score : undefined);
  const storedProfileViewsTotal = analytics.snapshot?.profileViews?.totalCount;
  const fallbackProfileViewsTotal =
    analytics.profileViewerCount +
    (analytics.profileViewerSummary?.privateViewerCount || 0) +
    (analytics.profileViewerSummary?.recruiterViewerCount || 0);
  const currentProfileViewsTotal = storedProfileViewsTotal ?? fallbackProfileViewsTotal;

  const acceptanceRatePoints = useMemo(
    () => buildAcceptanceRatePoints(analytics.connectionInvites, selectedDateRange),
    [analytics.connectionInvites, selectedDateRange]
  );
  const profileViewsPoints = useMemo(
    () =>
      buildDailyMetricPoints({
        snapshots: analytics.dailySnapshots,
        range: selectedDateRange,
        dataKey: 'profileViewsCount',
        currentValue: currentProfileViewsTotal,
      }),
    [analytics.dailySnapshots, currentProfileViewsTotal, selectedDateRange]
  );
  const profileViewsInRange = [...profileViewsPoints].reverse().find((point) => typeof point.value === 'number')?.value;
  const searchAppearancesPoints = useMemo(
    () =>
      buildDailyMetricPoints({
        snapshots: analytics.dailySnapshots,
        range: selectedDateRange,
        dataKey: 'searchAppearancesCount',
        currentValue: searchAppearancesInRange,
      }),
    [analytics.dailySnapshots, searchAppearancesInRange, selectedDateRange]
  );
  const socialSellingIndexPoints = useMemo(
    () =>
      buildDailyMetricPoints({
        snapshots: analytics.dailySnapshots,
        range: selectedDateRange,
        dataKey: 'socialSellingIndexScore',
        currentValue: socialSellingIndexInRange,
      }),
    [analytics.dailySnapshots, selectedDateRange, socialSellingIndexInRange]
  );

  return {
    ...analytics,
    profile,
    searchAppearances,
    socialSellingIndex,
    acceptanceRate,
    profileViewsInRange,
    connectionsFollowersPoints,
    connectionsInRange,
    followersInRange,
    searchAppearancesInRange,
    socialSellingIndexInRange,
    acceptanceRatePoints,
    profileViewsPoints,
    searchAppearancesPoints,
    socialSellingIndexPoints,
  };
}
