import type { ProfileAnalyticsConnectionInvite, ProfileAnalyticsDailySnapshot } from 'shared/types';
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
}: {
  snapshots: ProfileAnalyticsDailySnapshot[];
  range: DateRange;
  connectionDateCounts?: Record<string, number>;
  connectionDateCountsComplete?: boolean;
  connectionDateCountsUpdatedAt?: number;
  currentConnectionsCount?: number;
  currentFollowersCount?: number;
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
    if (typeof snapshot?.followersCount === 'number') {
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
      [dataKey]: currentSnapshot?.[dataKey] ?? currentValue,
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
