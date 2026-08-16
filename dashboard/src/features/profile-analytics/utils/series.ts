import type { ProfileAnalyticsConnectionInvite, ProfileAnalyticsDailySnapshot, ProfileViewer } from 'shared/types';
import type { MetricTrendPoint } from '../../../components/MetricTrendChart';
import { addDays, endOfDay, getDateKey, parseDate, startOfDay, type DateRange } from '../../../utils/date';
import type { ChartKey, ConnectionsFollowersPoint } from '../types';

export interface ProfileVisitorTrendPoint extends MetricTrendPoint {
  visibleCount: number;
  hiddenCount: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function getProfileViewerViewedAt(viewer: ProfileViewer): number {
  const fallback = viewer.firstSeenAt;
  const anchor = viewer.lastSeenAt || fallback;
  const text = viewer.viewedAgoText?.trim().toLowerCase() || '';
  const relativeMatch = text.match(
    /(?:viewed\s+)?(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\s+ago/
  );
  if (!relativeMatch) return fallback;

  const amount = Number(relativeMatch[1]);
  const unit = relativeMatch[2];
  if (!Number.isFinite(amount)) return fallback;
  if (/^(m|min|mins|minute|minutes)$/.test(unit)) return anchor - amount * MINUTE_MS;
  if (/^(h|hr|hrs|hour|hours)$/.test(unit)) return anchor - amount * HOUR_MS;
  if (/^(d|day|days)$/.test(unit)) return anchor - amount * DAY_MS;
  if (/^(w|wk|wks|week|weeks)$/.test(unit)) return anchor - amount * 7 * DAY_MS;
  if (/^(mo|mos|month|months)$/.test(unit)) return anchor - amount * 30 * DAY_MS;
  if (/^(y|yr|yrs|year|years)$/.test(unit)) return anchor - amount * 365 * DAY_MS;
  return fallback;
}

function getTimestamp(value: string | number | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (!value) return undefined;
  const parsed = parseDate(value);
  return parsed?.getTime();
}

export function getAllAnalyticsDateRange({
  snapshots,
  viewers,
  invites,
  connectionDateCounts,
  followerGrowthByDate,
}: {
  snapshots: ProfileAnalyticsDailySnapshot[];
  viewers: ProfileViewer[];
  invites: ProfileAnalyticsConnectionInvite[];
  connectionDateCounts?: Record<string, number>;
  followerGrowthByDate?: Record<string, number>;
}): DateRange {
  const timestamps = [
    ...snapshots.map((snapshot) => getTimestamp(snapshot.date)),
    ...viewers.map((viewer) => getProfileViewerViewedAt(viewer)),
    ...invites.map((invite) => getTimestamp(invite.sentAt)),
    ...Object.keys(connectionDateCounts || {}).map(getTimestamp),
    ...Object.keys(followerGrowthByDate || {}).map(getTimestamp),
  ].filter((timestamp): timestamp is number => typeof timestamp === 'number');
  const end = endOfDay(new Date());
  const earliest = timestamps.length > 0 ? Math.min(...timestamps) : startOfDay(end).getTime();
  return { start: startOfDay(new Date(earliest)), end };
}

export function sumDateCountsInRange(counts: Record<string, number> | undefined, range: DateRange): number {
  const start = startOfDay(range.start).getTime();
  const end = endOfDay(range.end).getTime();
  return Object.entries(counts || {}).reduce((total, [date, count]) => {
    const timestamp = getTimestamp(date);
    return typeof timestamp === 'number' && timestamp >= start && timestamp <= end && Number.isFinite(count)
      ? total + count
      : total;
  }, 0);
}

export function getCumulativeMetricChangeInRange({
  snapshots,
  range,
  dataKey,
  currentValue,
}: {
  snapshots: ProfileAnalyticsDailySnapshot[];
  range: DateRange;
  dataKey: 'connectionsCount' | 'followersCount';
  currentValue?: number;
}): number | undefined {
  const start = startOfDay(range.start).getTime();
  const end = endOfDay(range.end).getTime();
  const ordered = snapshots
    .map((snapshot) => ({
      timestamp: getTimestamp(snapshot.date),
      value: snapshot[dataKey],
      exact: dataKey !== 'connectionsCount' || snapshot.connectionsCountExact === true,
    }))
    .filter(
      (item): item is { timestamp: number; value: number; exact: boolean } =>
        typeof item.timestamp === 'number' && typeof item.value === 'number' && item.exact
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  const baseline = [...ordered].reverse().find((item) => item.timestamp < start)?.value;
  let finalValue = [...ordered].reverse().find((item) => item.timestamp <= end)?.value;
  if (end >= startOfDay(new Date()).getTime() && typeof currentValue === 'number') finalValue = currentValue;
  return typeof baseline === 'number' && typeof finalValue === 'number'
    ? Math.max(0, finalValue - baseline)
    : undefined;
}

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
  currentConnectionsCountExact,
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
  currentConnectionsCountExact?: boolean;
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
      connectionsCount:
        currentConnectionsCountExact === true ? currentConnectionsCount : currentSnapshot?.connectionsCount,
      connectionsCountExact: currentConnectionsCountExact === true ? true : currentSnapshot?.connectionsCountExact,
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
    .find(
      (item) =>
        item.date.getTime() <= start.getTime() &&
        item.snapshot.connectionsCountExact === true &&
        typeof item.snapshot.connectionsCount === 'number'
    )?.snapshot.connectionsCount;
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
    (historyCutoffKey && valuesByDate.get(historyCutoffKey)?.connectionsCountExact === true
      ? valuesByDate.get(historyCutoffKey)?.connectionsCount
      : undefined) ?? (currentConnectionsCountExact === true ? currentConnectionsCount : undefined);

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
    } else if (snapshot?.connectionsCountExact === true && typeof snapshot.connectionsCount === 'number') {
      latestConnections = snapshot.connectionsCount;
    } else if (connectionDateCountsComplete && typeof latestConnections !== 'number') {
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
      connectionsAdded: connectionDateCountsComplete ? connectionDateCounts?.[dateKey] : snapshot?.connectionsAdded,
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

export function buildProfileVisitorPoints({
  viewers,
  snapshots,
  range,
  mode,
  currentPrivateCount,
  currentRecruiterCount,
}: {
  viewers: ProfileViewer[];
  snapshots: ProfileAnalyticsDailySnapshot[];
  range: DateRange;
  mode: 'total' | 'range';
  currentPrivateCount?: number;
  currentRecruiterCount?: number;
}): ProfileVisitorTrendPoint[] {
  const start = startOfDay(range.start);
  const end = startOfDay(range.end);
  const rangeEnd = endOfDay(range.end).getTime();
  const firstSeenCountsByDate = new Map<string, number>();
  const privateCountsByDate = new Map<string, number>();
  const recruiterCountsByDate = new Map<string, number>();

  viewers.forEach((viewer) => {
    const viewedAt = getProfileViewerViewedAt(viewer);
    if (viewedAt < start.getTime() || viewedAt > rangeEnd) {
      return;
    }
    const dateKey = getDateKey(new Date(viewedAt));
    firstSeenCountsByDate.set(dateKey, (firstSeenCountsByDate.get(dateKey) || 0) + 1);
  });

  snapshots.forEach((snapshot) => {
    const date = parseDate(snapshot.date);
    if (!date) return;
    const dateKey = getDateKey(date);
    if (typeof snapshot.profileViewsPrivateCount === 'number') {
      privateCountsByDate.set(dateKey, snapshot.profileViewsPrivateCount);
    }
    const recruiterCount =
      typeof snapshot.profileViewsRecruiterCount === 'number'
        ? snapshot.profileViewsRecruiterCount
        : typeof snapshot.profileViewsCount === 'number' &&
            typeof snapshot.profileViewsVisibleCount === 'number' &&
            typeof snapshot.profileViewsPrivateCount === 'number'
          ? Math.max(
              0,
              snapshot.profileViewsCount - snapshot.profileViewsVisibleCount - snapshot.profileViewsPrivateCount
            )
          : undefined;
    if (typeof recruiterCount === 'number') {
      recruiterCountsByDate.set(dateKey, recruiterCount);
    }
  });
  const today = startOfDay(new Date());
  if (range.end.getTime() >= today.getTime() && typeof currentPrivateCount === 'number') {
    privateCountsByDate.set(getDateKey(today), currentPrivateCount);
  }
  if (range.end.getTime() >= today.getTime() && typeof currentRecruiterCount === 'number') {
    recruiterCountsByDate.set(getDateKey(today), currentRecruiterCount);
  }
  const startKey = getDateKey(start);
  const orderedPrivateCounts = Array.from(privateCountsByDate.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const privateBaseline = [...orderedPrivateCounts].reverse().find(([dateKey]) => dateKey < startKey)?.[1];
  const orderedRecruiterCounts = Array.from(recruiterCountsByDate.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const recruiterBaseline = [...orderedRecruiterCounts].reverse().find(([dateKey]) => dateKey < startKey)?.[1];

  const points: ProfileVisitorTrendPoint[] = [];
  let visibleCount = 0;
  let latestPrivateCount = privateBaseline ?? 0;
  let latestRecruiterCount = recruiterBaseline ?? 0;
  let privateCountInRange = 0;
  let recruiterCountInRange = 0;
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    const dateKey = getDateKey(cursor);
    visibleCount += firstSeenCountsByDate.get(dateKey) || 0;
    const privateCount = privateCountsByDate.get(dateKey);
    if (typeof privateCount === 'number') {
      if (mode === 'range' && typeof latestPrivateCount === 'number') {
        privateCountInRange += Math.max(0, privateCount - latestPrivateCount);
      }
      latestPrivateCount = privateCount;
    }
    const recruiterCount = recruiterCountsByDate.get(dateKey);
    if (typeof recruiterCount === 'number') {
      if (mode === 'range' && typeof latestRecruiterCount === 'number') {
        recruiterCountInRange += Math.max(0, recruiterCount - latestRecruiterCount);
      }
      latestRecruiterCount = recruiterCount;
    }
    const hiddenCount =
      mode === 'total'
        ? (latestPrivateCount || 0) + (latestRecruiterCount || 0)
        : privateCountInRange + recruiterCountInRange;
    points.push({
      date: new Date(cursor),
      value: visibleCount + hiddenCount,
      visibleCount,
      hiddenCount,
    });
  }

  return points;
}
