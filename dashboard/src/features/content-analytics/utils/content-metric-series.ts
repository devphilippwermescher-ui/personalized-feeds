import type {
  ContentAnalyticsDailySnapshot,
  ContentAnalyticsMetric,
  ContentAnalyticsRangeSnapshot,
} from 'shared/types';
import { DAY_MS } from '../../../utils/date';
import type { ContentMetricSeries, ContentSeriesPoint } from '../types';

/**
 * Metrics for which LinkedIn exposes an exact per-day value today.
 *
 * Everything else is reported as a range aggregate only. Spreading such an
 * aggregate across days, or attributing a post's lifetime engagement to its
 * publish date, would fabricate a trend, so those charts show an honest
 * unavailable state instead.
 */
const EXACT_DAILY_METRICS: ContentAnalyticsMetric[] = ['posts', 'impressions'];

const UNAVAILABLE_SERIES_LABEL =
  'LinkedIn does not publish this metric per day yet, so no daily trend can be shown.';

export function utcDateKeyToDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function toUtcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isDateKeyInRange(dateKey: string, startDate: string, endDate: string): boolean {
  return dateKey >= startDate && dateKey <= endDate;
}

/** Every inclusive UTC day of a range, so gaps render as gaps and not as zeros. */
export function buildRangeDateKeys(startDate: string, endDate: string): string[] {
  const start = utcDateKeyToDate(startDate).getTime();
  const end = utcDateKeyToDate(endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

  const dayCount = Math.round((end - start) / DAY_MS) + 1;
  return Array.from({ length: Math.min(dayCount, 400) }, (_, index) => toUtcDateKey(new Date(start + index * DAY_MS)));
}

export function filterDailySnapshotsToRange(
  dailySnapshots: ContentAnalyticsDailySnapshot[],
  range: Pick<ContentAnalyticsRangeSnapshot, 'startDate' | 'endDate'> | undefined
): ContentAnalyticsDailySnapshot[] {
  if (!range) return [];
  return dailySnapshots.filter((day) => isDateKeyInRange(day.date, range.startDate, range.endDate));
}

/**
 * Builds the chart series for one metric.
 *
 * The series is marked unavailable rather than zero-filled when LinkedIn has
 * no exact daily source, so the chart can say so instead of drawing a flat
 * line that looks like real data.
 */
export function buildContentMetricSeries({
  metric,
  dailySnapshots,
  range,
}: {
  metric: ContentAnalyticsMetric;
  dailySnapshots: ContentAnalyticsDailySnapshot[];
  range: Pick<ContentAnalyticsRangeSnapshot, 'startDate' | 'endDate'> | undefined;
}): ContentMetricSeries {
  if (!range) {
    return { points: [], available: false, emptyLabel: 'No content data has been collected yet.' };
  }

  const inRange = filterDailySnapshotsToRange(dailySnapshots, range);
  const byDate = new Map(inRange.map((day) => [day.date, day]));
  const hasExactValues = inRange.some(
    (day) => day.coverage[metric] !== 'unavailable' && typeof day.metrics[metric] === 'number'
  );

  if (!EXACT_DAILY_METRICS.includes(metric) || !hasExactValues) {
    return {
      points: [],
      available: false,
      emptyLabel: hasExactValues ? UNAVAILABLE_SERIES_LABEL : UNAVAILABLE_SERIES_LABEL,
    };
  }

  const points: ContentSeriesPoint[] = buildRangeDateKeys(range.startDate, range.endDate).map((dateKey) => {
    const day = byDate.get(dateKey);
    const value = day?.metrics[metric];
    return {
      date: utcDateKeyToDate(dateKey),
      dateKey,
      value: day && day.coverage[metric] !== 'unavailable' && typeof value === 'number' ? value : undefined,
    };
  });

  return { points, available: true, emptyLabel: 'No activity in this period' };
}
