import type { ProfileAnalyticsConnectionInvite, ProfileAnalyticsDailySnapshot, ProfileViewer } from 'shared/types';
import type { MetricTrendPoint } from '../../../components/MetricTrendChart';
import { addDays, endOfDay, getDateKey, parseDate, startOfDay, type DateRange } from '../../../utils/date';
import type { ChartKey, ConnectionsFollowersPoint } from '../types';

function indexLatestSnapshots(snapshots: ProfileAnalyticsDailySnapshot[]) {
  const valuesByDate = new Map<string, ProfileAnalyticsDailySnapshot>();
  snapshots.forEach((snapshot) => {
    const snapshotDate = parseDate(snapshot.date);
    if (!snapshotDate) return;

    const dateKey = getDateKey(snapshotDate);
    const existing = valuesByDate.get(dateKey);
    if (!existing || (snapshot.updatedAt || 0) >= (existing.updatedAt || 0)) {
      valuesByDate.set(dateKey, snapshot);
    }
  });
  return valuesByDate;
}

export function filterSnapshotsByRange(
  snapshots: ProfileAnalyticsDailySnapshot[],
  range: DateRange
): ProfileAnalyticsDailySnapshot[] {
  return snapshots.filter((snapshot) => {
    const timestamp = new Date(snapshot.date).getTime();
    return Number.isFinite(timestamp) && timestamp >= range.start.getTime() && timestamp <= range.end.getTime();
  });
}

export function getLatestRangeValue(points: ProfileAnalyticsDailySnapshot[], key: ChartKey): number | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index][key];
    if (typeof value === 'number') return value;
  }
  return undefined;
}

export function buildConnectionsFollowersPoints({
  snapshots,
  range,
  connectionDateCounts,
  connectionDateCountsComplete,
  connectionDateCountsUpdatedAt,
  currentConnectionsCount,
  currentFollowersCount,
  currentFollowersCountExact,
  followerGrowthByDate,
}: {
  snapshots: ProfileAnalyticsDailySnapshot[];
  range: DateRange;
  connectionDateCounts?: Record<string, number>;
  connectionDateCountsComplete?: boolean;
  connectionDateCountsUpdatedAt?: number;
  currentConnectionsCount?: number;
  currentFollowersCount?: number;
  currentFollowersCountExact?: boolean;
  followerGrowthByDate?: Record<string, number>;
}): ConnectionsFollowersPoint[] {
  const valuesByDate = indexLatestSnapshots(snapshots);
  const today = startOfDay(new Date());
  const todayKey = getDateKey(today);

  if (
    range.end.getTime() >= today.getTime() &&
    (typeof currentConnectionsCount === 'number' || typeof currentFollowersCount === 'number')
  ) {
    const currentSnapshot = valuesByDate.get(todayKey);
    valuesByDate.set(todayKey, {
      ...(currentSnapshot || { id: `current-${todayKey}`, date: todayKey, updatedAt: Date.now() }),
      connectionsCount: currentConnectionsCount ?? currentSnapshot?.connectionsCount,
      followersCount: currentFollowersCount ?? currentSnapshot?.followersCount,
      followersCountExact: currentFollowersCountExact ?? currentSnapshot?.followersCountExact,
    });
  }

  const orderedSnapshots = Array.from(valuesByDate.values())
    .map((snapshot) => ({ date: parseDate(snapshot.date), snapshot }))
    .filter((item): item is { date: Date; snapshot: ProfileAnalyticsDailySnapshot } => Boolean(item.date))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const start = startOfDay(range.start);
  const end = startOfDay(range.end);
  let latestConnections = [...orderedSnapshots]
    .reverse()
    .find((item) => item.date.getTime() <= start.getTime() && typeof item.snapshot.connectionsCount === 'number')
    ?.snapshot.connectionsCount;
  let latestFollowers = [...orderedSnapshots]
    .reverse()
    .find((item) => item.date.getTime() <= start.getTime() && typeof item.snapshot.followersCount === 'number')
    ?.snapshot.followersCount;
  const connectionDates = Object.entries(connectionDateCounts || {})
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  const historyCutoffKey =
    typeof connectionDateCountsUpdatedAt === 'number' ? getDateKey(new Date(connectionDateCountsUpdatedAt)) : undefined;
  const historyBaselineCount =
    (historyCutoffKey ? valuesByDate.get(historyCutoffKey)?.connectionsCount : undefined) ?? currentConnectionsCount;

  function getBackfilledConnections(dateKey: string): number | undefined {
    if (
      typeof historyBaselineCount !== 'number' ||
      connectionDates.length === 0 ||
      (historyCutoffKey && dateKey > historyCutoffKey)
    ) {
      return undefined;
    }
    const connectionsAddedLater = connectionDates.reduce(
      (total, [connectedDate, count]) => total + (connectedDate > dateKey ? count : 0),
      0
    );
    return Math.max(0, historyBaselineCount - connectionsAddedLater);
  }

  const followerGrowth = Object.entries(followerGrowthByDate || {})
    .filter(([, count]) => Number.isFinite(count) && count >= 0)
    .sort(([left], [right]) => left.localeCompare(right));
  const exactFollowerAnchors = Array.from(valuesByDate.entries())
    .filter(([, snapshot]) => snapshot.followersCountExact === true && typeof snapshot.followersCount === 'number')
    .map(([dateKey, snapshot]) => ({ dateKey, count: snapshot.followersCount as number }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  if (exactFollowerAnchors.length === 0 && typeof currentFollowersCount === 'number') {
    exactFollowerAnchors.push({ dateKey: todayKey, count: currentFollowersCount });
  }

  function getFollowerGrowthBetween(startExclusive: string, endInclusive: string): number {
    return followerGrowth.reduce(
      (total, [dateKey, count]) => total + (dateKey > startExclusive && dateKey <= endInclusive ? count : 0),
      0
    );
  }

  function getReconstructedFollowers(dateKey: string): number | undefined {
    if (followerGrowth.length === 0 || exactFollowerAnchors.length === 0) return undefined;
    const exactAnchor = exactFollowerAnchors.find((anchor) => anchor.dateKey === dateKey);
    if (exactAnchor) return exactAnchor.count;

    const futureAnchor = exactFollowerAnchors.find((anchor) => anchor.dateKey > dateKey);
    if (futureAnchor) {
      return Math.max(0, futureAnchor.count - getFollowerGrowthBetween(dateKey, futureAnchor.dateKey));
    }

    const previousAnchor = [...exactFollowerAnchors].reverse().find((anchor) => anchor.dateKey < dateKey);
    if (previousAnchor) {
      return Math.max(0, previousAnchor.count + getFollowerGrowthBetween(previousAnchor.dateKey, dateKey));
    }
    return undefined;
  }

  const points: ConnectionsFollowersPoint[] = [];

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    const dateKey = getDateKey(cursor);
    const snapshot = valuesByDate.get(dateKey);
    const historicalConnections = connectionDateCountsComplete ? getBackfilledConnections(dateKey) : undefined;
    if (typeof historicalConnections === 'number') {
      latestConnections = historicalConnections;
    } else if (typeof snapshot?.connectionsCount === 'number') {
      latestConnections = snapshot.connectionsCount;
    } else if (typeof latestConnections !== 'number') {
      latestConnections = getBackfilledConnections(dateKey);
    }
    const reconstructedFollowers = getReconstructedFollowers(dateKey);
    if (typeof reconstructedFollowers === 'number') {
      latestFollowers = reconstructedFollowers;
    } else if (typeof snapshot?.followersCount === 'number') {
      latestFollowers = snapshot.followersCount;
    }

    points.push({
      date: new Date(cursor),
      dateKey,
      connectionsCount: latestConnections,
      followersCount: latestFollowers,
    });
  }

  return points;
}

export function buildDailyMetricPoints({
  snapshots,
  range,
  dataKey,
  currentValue,
}: {
  snapshots: ProfileAnalyticsDailySnapshot[];
  range: DateRange;
  dataKey: ChartKey;
  currentValue?: number;
}): MetricTrendPoint[] {
  const valuesByDate = indexLatestSnapshots(snapshots);
  const today = startOfDay(new Date());
  const todayKey = getDateKey(today);

  if (range.end.getTime() >= today.getTime() && typeof currentValue === 'number') {
    const currentSnapshot = valuesByDate.get(todayKey);
    valuesByDate.set(todayKey, {
      ...(currentSnapshot || { id: `current-${todayKey}`, date: todayKey, updatedAt: Date.now() }),
      // The root snapshot is updated live and is authoritative for today.
      // A daily query can briefly contain the previous value while Firestore
      // listeners settle, so it must not override a newer current metric.
      [dataKey]: currentValue,
    });
  }

  const orderedSnapshots = Array.from(valuesByDate.values())
    .map((snapshot) => ({ date: parseDate(snapshot.date), snapshot }))
    .filter((item): item is { date: Date; snapshot: ProfileAnalyticsDailySnapshot } => Boolean(item.date))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const start = startOfDay(range.start);
  const end = startOfDay(range.end);
  let latestValue = [...orderedSnapshots]
    .reverse()
    .find((item) => item.date.getTime() <= start.getTime() && typeof item.snapshot[dataKey] === 'number')?.snapshot[
    dataKey
  ];
  const points: MetricTrendPoint[] = [];

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    const snapshot = valuesByDate.get(getDateKey(cursor));
    if (typeof snapshot?.[dataKey] === 'number') latestValue = snapshot[dataKey];
    points.push({ date: new Date(cursor), value: latestValue });
  }
  return points;
}

export function buildAcceptanceRatePoints(
  invites: ProfileAnalyticsConnectionInvite[],
  range: DateRange
): MetricTrendPoint[] {
  const start = startOfDay(range.start);
  const end = startOfDay(range.end);
  const sentInRange = invites.filter(
    (invite) => invite.sentAt >= start.getTime() && invite.sentAt <= range.end.getTime()
  );
  const points: MetricTrendPoint[] = [];

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    const cursorEnd = endOfDay(cursor).getTime();
    const sentCount = sentInRange.filter((invite) => invite.sentAt <= cursorEnd).length;
    const acceptedCount = sentInRange.filter(
      (invite) =>
        invite.status === 'accepted' && typeof invite.acceptedAt === 'number' && invite.acceptedAt <= cursorEnd
    ).length;
    points.push({
      date: new Date(cursor),
      value: sentCount > 0 ? (acceptedCount / sentCount) * 100 : undefined,
    });
  }
  return points;
}

export function buildProfileVisitorPoints(viewers: ProfileViewer[], range: DateRange): MetricTrendPoint[] {
  const start = startOfDay(range.start);
  const end = startOfDay(range.end);
  const rangeEnd = endOfDay(range.end).getTime();
  const firstSeenCountsByDate = new Map<string, number>();

  viewers.forEach((viewer) => {
    if (
      typeof viewer.firstSeenAt !== 'number' ||
      viewer.firstSeenAt < start.getTime() ||
      viewer.firstSeenAt > rangeEnd
    ) {
      return;
    }
    const dateKey = getDateKey(new Date(viewer.firstSeenAt));
    firstSeenCountsByDate.set(dateKey, (firstSeenCountsByDate.get(dateKey) || 0) + 1);
  });

  const points: MetricTrendPoint[] = [];
  let cumulativeCount = viewers.filter(
    (viewer) => typeof viewer.firstSeenAt === 'number' && viewer.firstSeenAt < start.getTime()
  ).length;
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    cumulativeCount += firstSeenCountsByDate.get(getDateKey(cursor)) || 0;
    points.push({ date: new Date(cursor), value: cumulativeCount });
  }

  return points;
}
