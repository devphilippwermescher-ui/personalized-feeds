import type { ContentAnalyticsMetricCoverage, ContentAnalyticsMetricValues } from 'shared/types';
import { DashboardAnalyticsError } from '../../background/dashboard-analytics/dashboard-analytics-errors';
import { getRscRecordText, parseOrderedRscFlightRecords, toUtcDateKey } from '../rsc-flight-records';
import { findRscHighlightValue, findRscRowValue, normalizeRscLabel } from './rsc-metric-rows';

export interface ContentAnalyticsDailyPoint {
  date: string;
  value: number;
}

export interface ContentAnalyticsRscResult {
  /** LinkedIn's own range token, e.g. `Past7Days` or `Custom`. */
  linkedInRange?: string;
  startDate?: string;
  endDate?: string;
  metrics: ContentAnalyticsMetricValues;
  coverage: ContentAnalyticsMetricCoverage;
  dailyImpressions?: ContentAnalyticsDailyPoint[];
  dailyLinkedInEngagements?: ContentAnalyticsDailyPoint[];
  topPostsUrl?: string;
}

/**
 * LinkedIn renders these labels in the viewer's interface language. Only the
 * English strings are matched: an unmatched row is reported as `unavailable`
 * coverage rather than being invented or defaulted to zero.
 */
const SOCIAL_ROW_LABELS: Array<{ label: string; key: keyof ContentAnalyticsMetricValues }> = [
  { label: 'reactions', key: 'reactions' },
  { label: 'comments', key: 'comments' },
  { label: 'reposts', key: 'reposts' },
  { label: 'saves', key: 'saves' },
  { label: 'sends on linkedin', key: 'sends' },
];

const IMPRESSIONS_LABEL = 'impressions';
const ENGAGEMENTS_LABEL = 'engagements';

interface SeriesBlock {
  name: string;
  points: ContentAnalyticsDailyPoint[];
}

function parseSeriesBlocks(payload: string): SeriesBlock[] {
  const blocks: SeriesBlock[] = [];
  const pattern = /"series":\[\{"name":"([^"]+)","data":\[([\s\S]*?)\],"dashStyle"/g;
  let match = pattern.exec(payload);
  while (match) {
    const points: ContentAnalyticsDailyPoint[] = [];
    const pointPattern = /"y":(-?\d+(?:\.\d+)?|null)[\s\S]*?"x":(\d+)/g;
    let pointMatch = pointPattern.exec(match[2]);
    while (pointMatch) {
      if (pointMatch[1] !== 'null') {
        points.push({ date: toUtcDateKey(Number(pointMatch[2])), value: Number(pointMatch[1]) });
      }
      pointMatch = pointPattern.exec(match[2]);
    }
    blocks.push({ name: match[1], points });
    match = pattern.exec(payload);
  }
  return blocks;
}

function isNonDecreasing(points: ContentAnalyticsDailyPoint[]): boolean {
  return points.every((point, index) => index === 0 || point.value >= points[index - 1].value);
}

function differenceCumulative(points: ContentAnalyticsDailyPoint[]): ContentAnalyticsDailyPoint[] {
  return points.map((point, index) => ({
    date: point.date,
    value: index === 0 ? point.value : point.value - points[index - 1].value,
  }));
}

/**
 * LinkedIn pre-renders both the daily and the cumulative variant of each
 * chart. The daily series is chosen by matching the aggregate; a cumulative
 * series is differenced, which is exact rather than an estimate.
 */
function selectDailySeries(
  blocks: SeriesBlock[],
  label: string,
  aggregate: number | undefined
): ContentAnalyticsDailyPoint[] | undefined {
  const candidates = blocks.filter((block) => normalizeRscLabel(block.name) === label && block.points.length > 0);
  if (candidates.length === 0) return undefined;
  if (typeof aggregate !== 'number') return candidates[0].points;

  const summed = candidates.find(
    (block) => block.points.reduce((total, point) => total + point.value, 0) === aggregate
  );
  if (summed) return summed.points;

  const cumulative = candidates.find(
    (block) => isNonDecreasing(block.points) && block.points[block.points.length - 1].value === aggregate
  );
  return cumulative ? differenceCumulative(cumulative.points) : undefined;
}

function readStateString(payload: string, stateId: string): string | undefined {
  const pattern = new RegExp(
    `"id":"${stateId}"\\}\\}[^}]*\\},"value":\\{"\\$case":"stringValue","stringValue":"([^"]*)"`
  );
  return payload.match(pattern)?.[1] || undefined;
}

function readTopPostsUrl(payload: string): string | undefined {
  const match = payload.match(/"stringValue":"(https:\/\/www\.linkedin\.com\/analytics\/creator\/top-posts\/[^"]*)"/);
  return match?.[1];
}

/**
 * Export-modal payload is the only place the response states its own inclusive
 * UTC window as plain `YYYY-MM-DD` strings.
 */
function readExportWindow(payload: string): { startDate?: string; endDate?: string } {
  const match = payload.match(/"payload":\{"startDate":"(\d{4}-\d{2}-\d{2})","endDate":"(\d{4}-\d{2}-\d{2})"\}/);
  return match ? { startDate: match[1], endDate: match[2] } : {};
}

/**
 * Reads the Content Analytics RSC stream.
 *
 * Throws `unsupported_rsc_shape` when neither the Impressions card nor its
 * series can be located, so a changed LinkedIn layout surfaces as an error
 * instead of a page full of zeros.
 */
export function parseContentAnalyticsRsc(payload: string): ContentAnalyticsRscResult {
  const records = parseOrderedRscFlightRecords(payload);
  if (records.length === 0) {
    throw new DashboardAnalyticsError('unsupported_rsc_shape', 'LinkedIn Content Analytics returned no records.');
  }

  const metrics: ContentAnalyticsMetricValues = {};
  const coverage: ContentAnalyticsMetricCoverage = {};
  let impressionsFound = false;

  records.forEach((record, index) => {
    const label = normalizeRscLabel(getRscRecordText(record.value));
    if (!label) return;

    if (label === IMPRESSIONS_LABEL && !impressionsFound) {
      const value = findRscHighlightValue(records, index);
      if (typeof value === 'number') {
        metrics.impressions = value;
        coverage.impressions = 'exact';
        impressionsFound = true;
      }
      return;
    }
    if (label === ENGAGEMENTS_LABEL && metrics.linkedInEngagements === undefined) {
      const value = findRscHighlightValue(records, index);
      if (typeof value === 'number') {
        metrics.linkedInEngagements = value;
        coverage.linkedInEngagements = 'exact';
      }
      return;
    }

    const socialRow = SOCIAL_ROW_LABELS.find((row) => row.label === label);
    if (!socialRow || metrics[socialRow.key] !== undefined) return;
    const value = findRscRowValue(records, index);
    if (typeof value === 'number') {
      Reflect.set(metrics, socialRow.key, value);
      Reflect.set(coverage, socialRow.key, 'exact');
    }
  });

  SOCIAL_ROW_LABELS.forEach((row) => {
    if (metrics[row.key] === undefined) Reflect.set(coverage, row.key, 'unavailable');
  });

  const seriesBlocks = parseSeriesBlocks(payload);
  const dailyImpressions = selectDailySeries(seriesBlocks, IMPRESSIONS_LABEL, metrics.impressions);
  const dailyLinkedInEngagements = selectDailySeries(
    seriesBlocks,
    ENGAGEMENTS_LABEL,
    metrics.linkedInEngagements
  );

  if (!impressionsFound && !dailyImpressions) {
    throw new DashboardAnalyticsError(
      'unsupported_rsc_shape',
      'LinkedIn Content Analytics did not expose an Impressions total or series.'
    );
  }
  if (!impressionsFound && dailyImpressions) {
    metrics.impressions = dailyImpressions.reduce((total, point) => total + point.value, 0);
    coverage.impressions = 'derived';
  }

  const exportWindow = readExportWindow(payload);
  return {
    linkedInRange: readStateString(payload, 'content_analytics_state_date_range_binding'),
    startDate: exportWindow.startDate,
    endDate: exportWindow.endDate,
    metrics,
    coverage,
    dailyImpressions,
    dailyLinkedInEngagements,
    topPostsUrl: readTopPostsUrl(payload),
  };
}
