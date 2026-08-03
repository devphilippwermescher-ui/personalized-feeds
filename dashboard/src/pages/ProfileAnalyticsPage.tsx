import {
  HiOutlineArrowPath,
  HiOutlineCalendarDays,
  HiOutlineEye,
  HiOutlineHeart,
  HiOutlineMagnifyingGlass,
  HiOutlineMapPin,
  HiOutlinePercentBadge,
  HiOutlineTrophy,
  HiOutlineUserGroup,
} from 'react-icons/hi2';
import { useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type {
  ProfileAnalyticsConnectionInvite,
  ProfileAnalyticsDailySnapshot,
  ProfileViewerListItem,
} from 'shared/types';
import { useProfileAnalytics } from '../hooks/useProfileAnalytics';
import { MetricTrendChart, type MetricTrendPoint } from '../components/MetricTrendChart';

interface ProfileAnalyticsPageProps {
  userId: string;
}

type ChartKey = keyof Pick<
  ProfileAnalyticsDailySnapshot,
  | 'connectionsCount'
  | 'followersCount'
  | 'profileViewsCount'
  | 'searchAppearancesCount'
  | 'socialSellingIndexScore'
  | 'acceptanceRate'
>;

type TimeRangeKey = '30d' | '90d' | '6m' | '1y';
type ActiveRangeKey = TimeRangeKey | 'custom';
type ConnectionsFollowersMode = 'both' | 'connections' | 'followers';

interface ConnectionsFollowersPoint {
  date: Date;
  dateKey: string;
  connectionsCount?: number;
  followersCount?: number;
}

const TIME_RANGES: Array<{ key: TimeRangeKey; label: string; days: number }> = [
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: '6m', label: '6 months', days: 183 },
  { key: '1y', label: '1 year', days: 365 },
];

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const CHART_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
});

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addMonths(value: Date, months: number): Date {
  const date = new Date(value);
  date.setMonth(date.getMonth() + months);
  return date;
}

function getPresetRange(days: number): { start: Date; end: Date } {
  const end = endOfDay(new Date());
  return {
    start: startOfDay(addDays(end, -days)),
    end,
  };
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

function isInDateRange(day: Date, start: Date, end: Date): boolean {
  const timestamp = startOfDay(day).getTime();
  return timestamp >= startOfDay(start).getTime() && timestamp <= startOfDay(end).getTime();
}

function formatShortDate(value: Date): string {
  return SHORT_DATE_FORMATTER.format(value).replace(',', '');
}

function formatChartDate(value: Date): string {
  return CHART_DATE_FORMATTER.format(value).replace(',', '');
}

function formatNumber(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '-';
}

function formatPercent(value: number | undefined): string {
  return typeof value === 'number' ? `${Math.round(value)}%` : '-';
}

function formatRangeLabel(range: ActiveRangeKey, customRange: { start: Date; end: Date }): string {
  const selected = TIME_RANGES.find((item) => item.key === range);
  return selected ? `Last ${selected.label}` : `${formatShortDate(customRange.start)} - ${formatShortDate(customRange.end)}`;
}

function parseDailyDate(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getDateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseSnapshotDate(value: string): Date | null {
  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return startOfDay(new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? startOfDay(new Date(timestamp)) : null;
}

function getChartPath(points: ProfileAnalyticsDailySnapshot[], key: ChartKey): string {
  const values = points
    .map((point, index) => ({ index, value: point[key] }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number');

  if (values.length < 2) {
    return '';
  }

  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = Math.max(1, max - min);
  const maxIndex = Math.max(1, points.length - 1);

  return values
    .map((point, pathIndex) => {
      const x = (point.index / maxIndex) * 100;
      const y = 100 - ((point.value - min) / range) * 82 - 8;
      return `${pathIndex === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function getLatestRangeValue(points: ProfileAnalyticsDailySnapshot[], key: ChartKey): number | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index][key];
    if (typeof value === 'number') {
      return value;
    }
  }

  return undefined;
}

function getNiceChartMax(value: number): number {
  if (value <= 0) {
    return 10;
  }

  const paddedValue = value * 1.12;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(paddedValue)) - 1);
  return Math.ceil(paddedValue / magnitude) * magnitude;
}

function buildConnectionsFollowersPoints({
  snapshots,
  start,
  end,
  currentConnectionsCount,
  currentFollowersCount,
}: {
  snapshots: ProfileAnalyticsDailySnapshot[];
  start: Date;
  end: Date;
  currentConnectionsCount?: number;
  currentFollowersCount?: number;
}): ConnectionsFollowersPoint[] {
  const valuesByDate = new Map<string, ProfileAnalyticsDailySnapshot>();

  snapshots.forEach((snapshot) => {
    const snapshotDate = parseSnapshotDate(snapshot.date);
    if (!snapshotDate) {
      return;
    }

    const dateKey = getDateKey(snapshotDate);
    const existing = valuesByDate.get(dateKey);
    if (!existing || (snapshot.updatedAt || 0) >= (existing.updatedAt || 0)) {
      valuesByDate.set(dateKey, snapshot);
    }
  });

  const todayKey = getDateKey(new Date());
  if (
    end.getTime() >= startOfDay(new Date()).getTime() &&
    (typeof currentConnectionsCount === 'number' || typeof currentFollowersCount === 'number')
  ) {
    const currentSnapshot = valuesByDate.get(todayKey);
    valuesByDate.set(todayKey, {
      ...(currentSnapshot || { id: `current-${todayKey}`, date: todayKey, updatedAt: Date.now() }),
      connectionsCount: currentSnapshot?.connectionsCount ?? currentConnectionsCount,
      followersCount: currentSnapshot?.followersCount ?? currentFollowersCount,
    });
  }

  const orderedSnapshots = Array.from(valuesByDate.entries())
    .map(([dateKey, snapshot]) => ({ dateKey, date: parseSnapshotDate(snapshot.date), snapshot }))
    .filter((item): item is { dateKey: string; date: Date; snapshot: ProfileAnalyticsDailySnapshot } => Boolean(item.date))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  const seedConnections =
    [...orderedSnapshots]
      .reverse()
      .find((item) => item.date.getTime() <= startDay.getTime() && typeof item.snapshot.connectionsCount === 'number')
      ?.snapshot.connectionsCount ??
    orderedSnapshots.find(
      (item) => item.date.getTime() <= endDay.getTime() && typeof item.snapshot.connectionsCount === 'number'
    )?.snapshot.connectionsCount ??
    currentConnectionsCount;
  const seedFollowers =
    [...orderedSnapshots]
      .reverse()
      .find((item) => item.date.getTime() <= startDay.getTime() && typeof item.snapshot.followersCount === 'number')
      ?.snapshot.followersCount ??
    orderedSnapshots.find(
      (item) => item.date.getTime() <= endDay.getTime() && typeof item.snapshot.followersCount === 'number'
    )?.snapshot.followersCount ??
    currentFollowersCount;
  const points: ConnectionsFollowersPoint[] = [];
  let cursor = startDay;
  let latestConnections: number | undefined = seedConnections;
  let latestFollowers: number | undefined = seedFollowers;

  while (cursor.getTime() <= endDay.getTime()) {
    const dateKey = getDateKey(cursor);
    const snapshot = valuesByDate.get(dateKey);
    if (typeof snapshot?.connectionsCount === 'number') {
      latestConnections = snapshot.connectionsCount;
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
    cursor = addDays(cursor, 1);
  }

  return points;
}

function buildDailyMetricPoints({
  snapshots,
  start,
  end,
  dataKey,
  currentValue,
}: {
  snapshots: ProfileAnalyticsDailySnapshot[];
  start: Date;
  end: Date;
  dataKey: ChartKey;
  currentValue?: number;
}): MetricTrendPoint[] {
  const valuesByDate = new Map<string, ProfileAnalyticsDailySnapshot>();
  snapshots.forEach((snapshot) => {
    const snapshotDate = parseSnapshotDate(snapshot.date);
    if (!snapshotDate) {
      return;
    }

    const dateKey = getDateKey(snapshotDate);
    const existing = valuesByDate.get(dateKey);
    if (!existing || (snapshot.updatedAt || 0) >= (existing.updatedAt || 0)) {
      valuesByDate.set(dateKey, snapshot);
    }
  });

  const today = startOfDay(new Date());
  const todayKey = getDateKey(today);
  if (end.getTime() >= today.getTime() && typeof currentValue === 'number') {
    const currentSnapshot = valuesByDate.get(todayKey);
    valuesByDate.set(todayKey, {
      ...(currentSnapshot || { id: `current-${todayKey}`, date: todayKey, updatedAt: Date.now() }),
      [dataKey]: currentSnapshot?.[dataKey] ?? currentValue,
    });
  }

  const orderedSnapshots = Array.from(valuesByDate.values())
    .map((snapshot) => ({ date: parseSnapshotDate(snapshot.date), snapshot }))
    .filter((item): item is { date: Date; snapshot: ProfileAnalyticsDailySnapshot } => Boolean(item.date))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  let latestValue =
    [...orderedSnapshots]
      .reverse()
      .find((item) => item.date.getTime() <= startDay.getTime() && typeof item.snapshot[dataKey] === 'number')
      ?.snapshot[dataKey] ??
    orderedSnapshots.find((item) => item.date.getTime() <= endDay.getTime() && typeof item.snapshot[dataKey] === 'number')
      ?.snapshot[dataKey] ??
    currentValue;
  const points: MetricTrendPoint[] = [];

  for (let cursor = startDay; cursor.getTime() <= endDay.getTime(); cursor = addDays(cursor, 1)) {
    const snapshot = valuesByDate.get(getDateKey(cursor));
    if (typeof snapshot?.[dataKey] === 'number') {
      latestValue = snapshot[dataKey];
    }
    points.push({ date: new Date(cursor), value: latestValue });
  }

  return points;
}

function buildAcceptanceRatePoints(
  invites: ProfileAnalyticsConnectionInvite[],
  start: Date,
  end: Date
): MetricTrendPoint[] {
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  const sentInRange = invites.filter((invite) => invite.sentAt >= startDay.getTime() && invite.sentAt <= end.getTime());
  const points: MetricTrendPoint[] = [];

  for (let cursor = startDay; cursor.getTime() <= endDay.getTime(); cursor = addDays(cursor, 1)) {
    const cursorEnd = endOfDay(cursor).getTime();
    const sentCount = sentInRange.filter((invite) => invite.sentAt <= cursorEnd).length;
    const acceptedCount = sentInRange.filter((invite) => (
      invite.status === 'accepted' &&
      typeof invite.acceptedAt === 'number' &&
      invite.acceptedAt <= cursorEnd
    )).length;
    points.push({
      date: new Date(cursor),
      value: sentCount > 0 ? (acceptedCount / sentCount) * 100 : undefined,
    });
  }

  return points;
}

function estimateViewerViewedAt(viewedAgoText: string | undefined, fallbackTimestamp: number): number {
  const normalized = viewedAgoText?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
  if (!normalized) {
    return fallbackTimestamp;
  }
  if (/\b(?:now|today|just)\b/.test(normalized)) {
    return Date.now();
  }
  if (/\byesterday\b/.test(normalized)) {
    return Date.now() - 24 * 60 * 60 * 1000;
  }

  const match = normalized.match(/(\d+)\s*(?:\+)?\s*(minute|min|m|hour|hr|h|day|d|week|wk|w|month|mo|year|yr|y)s?\b/);
  if (!match) {
    return fallbackTimestamp;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return fallbackTimestamp;
  }

  const unit = match[2];
  if (/^(?:minute|min|m)$/.test(unit)) return Date.now() - amount * 60 * 1000;
  if (/^(?:hour|hr|h)$/.test(unit)) return Date.now() - amount * 60 * 60 * 1000;
  if (/^(?:day|d)$/.test(unit)) return Date.now() - amount * 24 * 60 * 60 * 1000;
  if (/^(?:week|wk|w)$/.test(unit)) return Date.now() - amount * 7 * 24 * 60 * 60 * 1000;
  if (/^(?:month|mo)$/.test(unit)) return Date.now() - amount * 30 * 24 * 60 * 60 * 1000;
  if (/^(?:year|yr|y)$/.test(unit)) return Date.now() - amount * 365 * 24 * 60 * 60 * 1000;
  return fallbackTimestamp;
}

function buildProfileViewsPoints(
  viewers: ProfileViewerListItem[],
  start: Date,
  end: Date
): MetricTrendPoint[] {
  const countsByDate = new Map<string, number>();
  viewers.forEach((viewer) => {
    const viewedAt = estimateViewerViewedAt(viewer.viewedAgoText, viewer.lastSeenAt);
    if (viewedAt < start.getTime() || viewedAt > end.getTime()) {
      return;
    }

    const dateKey = getDateKey(new Date(viewedAt));
    countsByDate.set(dateKey, (countsByDate.get(dateKey) || 0) + 1);
  });

  const points: MetricTrendPoint[] = [];
  for (let cursor = startOfDay(start); cursor.getTime() <= startOfDay(end).getTime(); cursor = addDays(cursor, 1)) {
    points.push({ date: new Date(cursor), value: countsByDate.get(getDateKey(cursor)) || 0 });
  }
  return points;
}
function getChartValues(points: ConnectionsFollowersPoint[], mode: ConnectionsFollowersMode): number[] {
  const values: number[] = [];
  points.forEach((point) => {
    if ((mode === 'both' || mode === 'connections') && typeof point.connectionsCount === 'number') {
      values.push(point.connectionsCount);
    }
    if ((mode === 'both' || mode === 'followers') && typeof point.followersCount === 'number') {
      values.push(point.followersCount);
    }
  });
  return values;
}

function getConnectionFollowerPath(
  points: ConnectionsFollowersPoint[],
  key: 'connectionsCount' | 'followersCount',
  chartMax: number
): string {
  const plotLeft = 62;
  const plotTop = 14;
  const plotWidth = 912;
  const plotHeight = 196;
  const maxIndex = Math.max(1, points.length - 1);
  const values = points
    .map((point, index) => ({ index, value: point[key] }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number');

  if (values.length < 2) {
    return '';
  }

  return values
    .map((point, pathIndex) => {
      const x = plotLeft + (point.index / maxIndex) * plotWidth;
      const y = plotTop + (1 - point.value / chartMax) * plotHeight;
      return `${pathIndex === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function getConnectionFollowerAreaPath(
  points: ConnectionsFollowersPoint[],
  key: 'connectionsCount' | 'followersCount',
  chartMax: number
): string {
  const linePath = getConnectionFollowerPath(points, key, chartMax);
  if (!linePath) {
    return '';
  }

  const plotLeft = 62;
  const plotBottom = 210;
  const plotWidth = 912;
  const maxIndex = Math.max(1, points.length - 1);
  const valuedIndexes = points
    .map((point, index) => ({ index, value: point[key] }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number');
  const firstX = plotLeft + (valuedIndexes[0].index / maxIndex) * plotWidth;
  const lastX = plotLeft + (valuedIndexes[valuedIndexes.length - 1].index / maxIndex) * plotWidth;
  return `${linePath} L ${lastX.toFixed(2)} ${plotBottom} L ${firstX.toFixed(2)} ${plotBottom} Z`;
}

function getSingleSeriesPoint(
  points: ConnectionsFollowersPoint[],
  key: 'connectionsCount' | 'followersCount'
): { index: number; value: number } | null {
  const values = points
    .map((point, index) => ({ index, value: point[key] }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number');

  return values.length === 1 ? values[0] : null;
}

function getXAxisTickIndexes(points: ConnectionsFollowersPoint[]): number[] {
  if (points.length <= 1) {
    return [0];
  }

  const tickCount = Math.min(8, Math.max(2, Math.ceil(points.length / 5)));
  return Array.from({ length: tickCount }, (_, index) =>
    Math.round((index / Math.max(1, tickCount - 1)) * (points.length - 1))
  ).filter((value, index, values) => values.indexOf(value) === index);
}

function buildCalendarDays(month: Date): Date[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const start = addDays(firstDay, -startOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function CustomDatePicker({
  customRange,
  visibleMonth,
  activeBoundary,
  onVisibleMonthChange,
  onActiveBoundaryChange,
  onRangeChange,
}: {
  customRange: { start: Date; end: Date };
  visibleMonth: Date;
  activeBoundary: 'start' | 'end';
  onVisibleMonthChange: (date: Date) => void;
  onActiveBoundaryChange: (boundary: 'start' | 'end') => void;
  onRangeChange: (range: { start: Date; end: Date }) => void;
}) {
  const days = buildCalendarDays(visibleMonth);

  const selectDay = (day: Date) => {
    const selected = startOfDay(day);
    if (activeBoundary === 'start') {
      const nextStart = selected;
      const nextEnd = selected.getTime() > customRange.end.getTime() ? endOfDay(selected) : customRange.end;
      onRangeChange({ start: nextStart, end: nextEnd });
      onActiveBoundaryChange('end');
      return;
    }

    const nextEnd = endOfDay(selected);
    const nextStart = nextEnd.getTime() < customRange.start.getTime() ? startOfDay(selected) : customRange.start;
    onRangeChange({ start: nextStart, end: nextEnd });
  };

  return (
    <div className="profile-analytics-date-popover">
      <div className="profile-analytics-date-fields">
        <button
          className={activeBoundary === 'start' ? 'is-active' : ''}
          type="button"
          onClick={() => onActiveBoundaryChange('start')}
        >
          From: {formatShortDate(customRange.start)}
        </button>
        <button
          className={activeBoundary === 'end' ? 'is-active' : ''}
          type="button"
          onClick={() => onActiveBoundaryChange('end')}
        >
          To: {formatShortDate(customRange.end)}
        </button>
      </div>

      <div className="profile-analytics-calendar-header">
        <button type="button" onClick={() => onVisibleMonthChange(addMonths(visibleMonth, -1))}>
          &lt;
        </button>
        <strong>{MONTH_FORMATTER.format(visibleMonth)}</strong>
        <button type="button" onClick={() => onVisibleMonthChange(addMonths(visibleMonth, 1))}>
          &gt;
        </button>
      </div>

      <div className="profile-analytics-calendar-grid profile-analytics-calendar-weekdays">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="profile-analytics-calendar-grid">
        {days.map((day) => {
          const isOutsideMonth = day.getMonth() !== visibleMonth.getMonth();
          const isSelectedStart = isSameDay(day, customRange.start);
          const isSelectedEnd = isSameDay(day, customRange.end);
          const isSelected = isSelectedStart || isSelectedEnd;
          const isInRange = isInDateRange(day, customRange.start, customRange.end);

          return (
            <button
              key={day.toISOString()}
              className={[
                isOutsideMonth ? 'is-muted' : '',
                isInRange ? 'is-in-range' : '',
                isSelected ? 'is-selected' : '',
              ].filter(Boolean).join(' ')}
              type="button"
              onClick={() => selectDay(day)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConnectionsFollowersChart({
  points,
  rangeLabel,
}: {
  points: ConnectionsFollowersPoint[];
  rangeLabel: string;
}) {
  const [mode, setMode] = useState<ConnectionsFollowersMode>('both');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const values = getChartValues(points, mode);
  const hasData = values.length > 0;
  const chartMax = getNiceChartMax(Math.max(...values, 0));
  const yTicks = [chartMax, Math.round(chartMax * 0.5), Math.round(chartMax * 0.25), 0]
    .filter((value, index, list) => list.indexOf(value) === index);
  const xTicks = getXAxisTickIndexes(points);
  const maxIndex = Math.max(1, points.length - 1);
  const plotLeft = 62;
  const plotTop = 14;
  const plotBottom = 210;
  const plotWidth = 912;
  const plotHeight = plotBottom - plotTop;
  const connectionsPath = getConnectionFollowerPath(points, 'connectionsCount', chartMax);
  const followersPath = getConnectionFollowerPath(points, 'followersCount', chartMax);
  const connectionsAreaPath = getConnectionFollowerAreaPath(points, 'connectionsCount', chartMax);
  const followersAreaPath = getConnectionFollowerAreaPath(points, 'followersCount', chartMax);
  const singleConnectionsPoint = getSingleSeriesPoint(points, 'connectionsCount');
  const singleFollowersPoint = getSingleSeriesPoint(points, 'followersCount');
  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  const showConnections = mode === 'both' || mode === 'connections';
  const showFollowers = mode === 'both' || mode === 'followers';

  function getX(index: number): number {
    return plotLeft + (index / maxIndex) * plotWidth;
  }

  function getY(value: number): number {
    return plotTop + (1 - value / chartMax) * plotHeight;
  }

  function handlePointerMove(event: ReactMouseEvent<SVGSVGElement>) {
    if (!points.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 1000;
    const clampedX = Math.max(plotLeft, Math.min(plotLeft + plotWidth, x));
    const index = Math.round(((clampedX - plotLeft) / plotWidth) * maxIndex);
    setHoveredIndex(Math.max(0, Math.min(points.length - 1, index)));
  }

  const tooltipX = hoveredIndex !== null ? getX(hoveredIndex) : 0;
  const tooltipLeft = Math.min(Math.max(tooltipX + 12, plotLeft), 842);
  const tooltipTop = 92;

  return (
    <section className="profile-analytics-card profile-analytics-card--wide profile-analytics-trend-card">
      <div className="profile-analytics-trend-header">
        <div className="profile-analytics-trend-title">
          <HiOutlineUserGroup />
          <h2>Connections & Followers</h2>
          <span>{rangeLabel}</span>
        </div>
        <div className="profile-analytics-chart-tabs" aria-label="Connections followers chart mode">
          {[
            { key: 'both', label: 'Both' },
            { key: 'connections', label: 'Connections' },
            { key: 'followers', label: 'Followers' },
          ].map((item) => (
            <button
              key={item.key}
              className={mode === item.key ? 'is-active' : ''}
              type="button"
              onClick={() => setMode(item.key as ConnectionsFollowersMode)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="profile-analytics-line-chart">
        {hasData ? (
          <svg
            viewBox="0 0 1000 270"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <defs>
              <linearGradient id="connectionsAreaGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#0A66C2" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#0A66C2" stopOpacity="0.03" />
              </linearGradient>
              <linearGradient id="followersAreaGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#19b8bf" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#19b8bf" stopOpacity="0.03" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="1000" height="270" fill="#fff" />

            {yTicks.map((tick) => {
              const y = getY(tick);
              return (
                <g key={tick}>
                  <text x="44" y={y + 4} textAnchor="end" className="profile-analytics-chart-axis-text">
                    {tick.toLocaleString()}
                  </text>
                  <line
                    x1={plotLeft}
                    x2={plotLeft + plotWidth}
                    y1={y}
                    y2={y}
                    className="profile-analytics-chart-grid-line"
                  />
                </g>
              );
            })}

            {xTicks.map((index) => {
              const x = getX(index);
              return (
                <g key={points[index].dateKey}>
                  <line
                    x1={x}
                    x2={x}
                    y1={plotTop}
                    y2={plotBottom}
                    className="profile-analytics-chart-grid-line"
                  />
                  <text x={x} y="236" textAnchor="middle" className="profile-analytics-chart-axis-text">
                    {formatChartDate(points[index].date)}
                  </text>
                </g>
              );
            })}

            <line
              x1={plotLeft}
              x2={plotLeft + plotWidth}
              y1={plotBottom}
              y2={plotBottom}
              className="profile-analytics-chart-axis-line"
            />

            {showConnections && connectionsAreaPath ? (
              <path d={connectionsAreaPath} fill="url(#connectionsAreaGradient)" />
            ) : null}
            {showFollowers && followersAreaPath ? (
              <path d={followersAreaPath} fill="url(#followersAreaGradient)" />
            ) : null}
            {showConnections && connectionsPath ? (
              <path d={connectionsPath} className="profile-analytics-series profile-analytics-series--connections" />
            ) : null}
            {showFollowers && followersPath ? (
              <path d={followersPath} className="profile-analytics-series profile-analytics-series--followers" />
            ) : null}
            {showConnections && singleConnectionsPoint ? (
              <circle
                cx={getX(singleConnectionsPoint.index)}
                cy={getY(singleConnectionsPoint.value)}
                r="4"
                className="profile-analytics-chart-dot profile-analytics-chart-dot--connections"
              />
            ) : null}
            {showFollowers && singleFollowersPoint ? (
              <circle
                cx={getX(singleFollowersPoint.index)}
                cy={getY(singleFollowersPoint.value)}
                r="4"
                className="profile-analytics-chart-dot profile-analytics-chart-dot--followers"
              />
            ) : null}

            {hoveredPoint ? (
              <g>
                <line
                  x1={tooltipX}
                  x2={tooltipX}
                  y1={plotTop}
                  y2={plotBottom}
                  className="profile-analytics-chart-hover-line"
                />
                {showConnections && typeof hoveredPoint.connectionsCount === 'number' ? (
                  <circle
                    cx={tooltipX}
                    cy={getY(hoveredPoint.connectionsCount)}
                    r="4"
                    className="profile-analytics-chart-dot profile-analytics-chart-dot--connections"
                  />
                ) : null}
                {showFollowers && typeof hoveredPoint.followersCount === 'number' ? (
                  <circle
                    cx={tooltipX}
                    cy={getY(hoveredPoint.followersCount)}
                    r="4"
                    className="profile-analytics-chart-dot profile-analytics-chart-dot--followers"
                  />
                ) : null}

                <g transform={`translate(${tooltipLeft} ${tooltipTop})`}>
                  <rect width="132" height={mode === 'both' ? 84 : 62} rx="6" className="profile-analytics-chart-tooltip-bg" />
                  <text x="14" y="23" className="profile-analytics-chart-tooltip-date">
                    {formatChartDate(hoveredPoint.date)}
                  </text>
                  {showConnections ? (
                    <text x="14" y="48" className="profile-analytics-chart-tooltip-connections">
                      Connections : {formatNumber(hoveredPoint.connectionsCount)}
                    </text>
                  ) : null}
                  {showFollowers ? (
                    <text
                      x="14"
                      y={showConnections ? 72 : 48}
                      className="profile-analytics-chart-tooltip-followers"
                    >
                      Followers : {formatNumber(hoveredPoint.followersCount)}
                    </text>
                  ) : null}
                </g>
              </g>
            ) : null}

            <text
              x="24"
              y="112"
              textAnchor="middle"
              transform="rotate(-90 24 112)"
              className="profile-analytics-chart-axis-label"
            >
              Count
            </text>
            <text x="518" y="264" textAnchor="middle" className="profile-analytics-chart-axis-label">
              Date
            </text>
          </svg>
        ) : (
          <div className="profile-analytics-chart-empty">No connection trend yet</div>
        )}
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  rangeLabel,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  rangeLabel: string;
  tone: 'blue' | 'cyan' | 'mint' | 'sky' | 'violet' | 'amber';
}) {
  return (
    <div className="profile-analytics-metric">
      <div className={`profile-analytics-metric-icon profile-analytics-metric-icon--${tone}`}>{icon}</div>
      <div>
        <div className="profile-analytics-metric-value">{value}</div>
        <div className="profile-analytics-metric-label">
          {label} <span>({rangeLabel})</span>
        </div>
      </div>
    </div>
  );
}

export default function ProfileAnalyticsPage({ userId }: ProfileAnalyticsPageProps) {
  const defaultCustomRange = getPresetRange(30);
  const [range, setRange] = useState<ActiveRangeKey>('30d');
  const [isCustomPickerOpen, setIsCustomPickerOpen] = useState(false);
  const [activeCustomBoundary, setActiveCustomBoundary] = useState<'start' | 'end'>('start');
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [visibleMonth, setVisibleMonth] = useState(startOfDay(new Date()));
  const selectedRange = TIME_RANGES.find((item) => item.key === range);
  const selectedDateRange = selectedRange ? getPresetRange(selectedRange.days) : customRange;
  const {
    snapshot,
    dailySnapshots,
    acceptanceSnapshot,
    profileViewsInRange,
    profileViewers,
    connectionInvites,
    loading,
    error,
  } = useProfileAnalytics(
    userId,
    selectedDateRange.start.getTime(),
    selectedDateRange.end.getTime()
  );
  const rangeLabel = formatRangeLabel(range, customRange);
  const profile = snapshot?.profile;
  const searchAppearances = snapshot?.searchAppearances;
  const socialSellingIndex = snapshot?.socialSellingIndex;
  const acceptanceRate = acceptanceSnapshot || snapshot?.acceptanceRate;
  const filteredDailySnapshots = useMemo(() => {
    return dailySnapshots.filter((point) => {
      const timestamp = parseDailyDate(point.date);
      return timestamp >= selectedDateRange.start.getTime() && timestamp <= selectedDateRange.end.getTime();
    });
  }, [dailySnapshots, selectedDateRange.end, selectedDateRange.start]);
  const connectionsFollowersPoints = useMemo(() => {
    return buildConnectionsFollowersPoints({
      snapshots: dailySnapshots,
      start: selectedDateRange.start,
      end: selectedDateRange.end,
      currentConnectionsCount: profile?.connectionsCount,
      currentFollowersCount: profile?.followersCount,
    });
  }, [
    dailySnapshots,
    profile?.connectionsCount,
    profile?.followersCount,
    selectedDateRange.end,
    selectedDateRange.start,
  ]);
  const canUseCurrentProfileTotals = selectedDateRange.end.getTime() >= startOfDay(new Date()).getTime();
  const connectionsInRange =
    getLatestRangeValue(filteredDailySnapshots, 'connectionsCount') ||
    (canUseCurrentProfileTotals ? profile?.connectionsCount : undefined);
  const followersInRange =
    getLatestRangeValue(filteredDailySnapshots, 'followersCount') ||
    (canUseCurrentProfileTotals ? profile?.followersCount : undefined);
  const searchAppearancesInRange =
    getLatestRangeValue(filteredDailySnapshots, 'searchAppearancesCount') ?? searchAppearances?.totalCount;
  const socialSellingIndexInRange =
    getLatestRangeValue(filteredDailySnapshots, 'socialSellingIndexScore') ?? socialSellingIndex?.score;
  const acceptanceRatePoints = useMemo(
    () => buildAcceptanceRatePoints(connectionInvites, selectedDateRange.start, selectedDateRange.end),
    [connectionInvites, selectedDateRange.end, selectedDateRange.start]
  );
  const profileViewsPoints = useMemo(
    () => buildProfileViewsPoints(profileViewers, selectedDateRange.start, selectedDateRange.end),
    [profileViewers, selectedDateRange.end, selectedDateRange.start]
  );
  const searchAppearancesPoints = useMemo(
    () => buildDailyMetricPoints({
      snapshots: dailySnapshots,
      start: selectedDateRange.start,
      end: selectedDateRange.end,
      dataKey: 'searchAppearancesCount',
      currentValue: searchAppearancesInRange,
    }),
    [dailySnapshots, searchAppearancesInRange, selectedDateRange.end, selectedDateRange.start]
  );
  const socialSellingIndexPoints = useMemo(
    () => buildDailyMetricPoints({
      snapshots: dailySnapshots,
      start: selectedDateRange.start,
      end: selectedDateRange.end,
      dataKey: 'socialSellingIndexScore',
      currentValue: socialSellingIndexInRange,
    }),
    [dailySnapshots, selectedDateRange.end, selectedDateRange.start, socialSellingIndexInRange]
  );

  return (
    <div className="profile-analytics-page">
      <section className="profile-analytics-hero">
        <div
          className="profile-analytics-cover"
          style={profile?.backgroundImageUrl ? { backgroundImage: `url(${profile.backgroundImageUrl})` } : undefined}
        />
        <div className="profile-analytics-profile">
          {profile?.profileImageUrl ? (
            <img src={profile.profileImageUrl} alt="" className="profile-analytics-avatar" />
          ) : (
            <div className="profile-analytics-avatar profile-analytics-avatar--fallback">
              {profile?.displayName?.charAt(0).toUpperCase() || 'P'}
            </div>
          )}
          <div className="profile-analytics-profile-copy">
            <h1>{profile?.displayName || 'Profile Analytics'}</h1>
            <p>{profile?.headline || 'Sync your LinkedIn profile to start collecting analytics.'}</p>
            <div className="profile-analytics-profile-meta">
              {profile?.location ? (
                <span>
                  <HiOutlineMapPin />
                  {profile.location}
                </span>
              ) : null}
              {typeof profile?.connectionsCount === 'number' ? (
                <span>
                  <HiOutlineUserGroup />
                  {formatNumber(profile.connectionsCount)} Connections
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="page-header profile-analytics-heading">
        <div>
          <h1>Profile Analytics</h1>
          <p className="page-subtitle">Your LinkedIn profile at a glance</p>
        </div>
        <div className="profile-analytics-range-control" aria-label="Analytics time range">
          {TIME_RANGES.map((item) => (
            <button
              key={item.key}
              className={item.key === range ? 'is-active' : ''}
              type="button"
              onClick={() => {
                setRange(item.key);
                setIsCustomPickerOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
          <div className="profile-analytics-custom-date">
            <button
              className={range === 'custom' ? 'is-active' : ''}
              type="button"
              onClick={() => {
                setRange('custom');
                setIsCustomPickerOpen((value) => !value);
              }}
            >
              <HiOutlineCalendarDays />
              Custom Date
            </button>
            {isCustomPickerOpen ? (
              <CustomDatePicker
                customRange={customRange}
                visibleMonth={visibleMonth}
                activeBoundary={activeCustomBoundary}
                onVisibleMonthChange={setVisibleMonth}
                onActiveBoundaryChange={setActiveCustomBoundary}
                onRangeChange={(nextRange) => {
                  setCustomRange(nextRange);
                  setRange('custom');
                }}
              />
            ) : null}
          </div>
          <button
            className="profile-analytics-range-reset"
            type="button"
            aria-label="Reset to 30 days"
            title="Reset to 30 days"
            onClick={() => {
              const defaultRange = getPresetRange(30);
              setRange('30d');
              setCustomRange(defaultRange);
              setVisibleMonth(startOfDay(defaultRange.end));
              setActiveCustomBoundary('start');
              setIsCustomPickerOpen(false);
            }}
          >
            <HiOutlineArrowPath />
          </button>
        </div>
      </div>

      {error ? <div className="profile-analytics-alert profile-analytics-alert--error">{error}</div> : null}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
        </div>
      ) : (
        <>
          <div className="profile-analytics-metrics-grid">
            <MetricCard
              icon={<HiOutlineUserGroup />}
              value={formatNumber(connectionsInRange)}
              label="Connections"
              rangeLabel={rangeLabel}
              tone="blue"
            />
            <MetricCard
              icon={<HiOutlineHeart />}
              value={formatNumber(followersInRange)}
              label="Followers"
              rangeLabel={rangeLabel}
              tone="cyan"
            />
            <MetricCard
              icon={<HiOutlinePercentBadge />}
              value={acceptanceRate && acceptanceRate.sentCount > 0 ? formatPercent(acceptanceRate.rate) : '-'}
              label="Acceptance Rate"
              rangeLabel={rangeLabel}
              tone="mint"
            />
            <MetricCard
              icon={<HiOutlineEye />}
              value={formatNumber(profileViewsInRange)}
              label="Profile Views"
              rangeLabel={rangeLabel}
              tone="sky"
            />
            <MetricCard
              icon={<HiOutlineMagnifyingGlass />}
              value={formatNumber(searchAppearancesInRange)}
              label="Search Appearances"
              rangeLabel={searchAppearances?.periodLabel || rangeLabel}
              tone="violet"
            />
            <MetricCard
              icon={<HiOutlineTrophy />}
              value={typeof socialSellingIndexInRange === 'number' ? `${socialSellingIndexInRange}/100` : '-'}
              label="Social Selling Index"
              rangeLabel={rangeLabel}
              tone="amber"
            />
          </div>

          <div className="profile-analytics-chart-grid">
            <ConnectionsFollowersChart points={connectionsFollowersPoints} rangeLabel={rangeLabel} />

            <MetricTrendChart
              title="Acceptance Rate"
              summary={`${acceptanceRate && acceptanceRate.sentCount > 0 ? formatPercent(acceptanceRate.rate) : '-'} total`}
              rangeLabel={rangeLabel}
              icon={<HiOutlinePercentBadge />}
              points={acceptanceRatePoints}
              color="#10A88A"
              gradientId="acceptanceRateAreaGradient"
              minimumMax={100}
              valueFormatter={formatPercent}
              emptyLabel="No invitation trend yet"
            />
            <MetricTrendChart
              title="Profile Views"
              summary={`${formatNumber(profileViewsInRange)} total`}
              rangeLabel={rangeLabel}
              icon={<HiOutlineEye />}
              points={profileViewsPoints}
              color="#0A66C2"
              gradientId="profileViewsAreaGradient"
              emptyLabel="No profile view trend yet"
            />
            <MetricTrendChart
              title="Search Appearances"
              summary={`${formatNumber(searchAppearancesInRange)} total`}
              rangeLabel={rangeLabel}
              icon={<HiOutlineMagnifyingGlass />}
              points={searchAppearancesPoints}
              color="#8B5CF6"
              gradientId="searchAppearancesAreaGradient"
              emptyLabel="No search appearance trend yet"
            />
            <MetricTrendChart
              title="Social Selling Index (SSI)"
              summary={`${typeof socialSellingIndexInRange === 'number' ? `${socialSellingIndexInRange}/100` : '-'} total`}
              rangeLabel={rangeLabel}
              icon={<HiOutlineTrophy />}
              points={socialSellingIndexPoints}
              color="#E89A00"
              gradientId="socialSellingIndexAreaGradient"
              minimumMax={100}
              valueFormatter={(value) => typeof value === 'number' ? `${value}/100` : '-'}
              emptyLabel="No SSI trend yet"
            />
          </div>
        </>
      )}
    </div>
  );
}
