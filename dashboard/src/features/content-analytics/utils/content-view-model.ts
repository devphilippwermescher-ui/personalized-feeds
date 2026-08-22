import { getContentAnalyticsRangeId } from 'shared/content-analytics-metrics';
import type {
  ContentAnalyticsMetric,
  ContentAnalyticsRangeSnapshot,
  ContentAnalyticsSnapshot,
  DashboardAnalyticsSourceStatus,
  DashboardAnalyticsSyncManifest,
} from 'shared/types';
import { getDateKey } from '../../../utils/date';
import { formatNumber } from '../../../utils/format';
import { CONTENT_METRICS } from '../constants';
import type { ActiveContentRangeKey, ContentMetricCardModel } from '../types';

export function hasPublishedContentAnalyticsData(
  snapshot: ContentAnalyticsSnapshot | null,
  ranges: ContentAnalyticsRangeSnapshot[]
): boolean {
  return Boolean(snapshot?.range || ranges.length > 0);
}

/** One decimal, matching the design. `null` and `undefined` both render a dash. */
export function formatEngagementRate(value: number | null | undefined): string {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : '—';
}

export function formatContentMetricValue(metric: ContentAnalyticsMetric, value: number | null | undefined): string {
  if (metric === 'engagementRate') return formatEngagementRate(value);
  if (typeof value !== 'number') return '—';
  return value >= 10_000 ? `${(value / 1000).toFixed(1)}K` : formatNumber(value);
}

/**
 * Finds the collected snapshot for the selected range.
 *
 * A custom window falls back to the narrowest collected range that fully
 * contains it, so the page shows real collected numbers rather than a blank
 * card while its own window is still being collected.
 */
export function selectContentRangeSnapshot(
  ranges: ContentAnalyticsRangeSnapshot[],
  rangeKey: ActiveContentRangeKey,
  customRange: { start: Date; end: Date },
  currentRange?: ContentAnalyticsRangeSnapshot
): ContentAnalyticsRangeSnapshot | undefined {
  if (rangeKey === 'total') {
    const uniqueRanges = new Map<string, ContentAnalyticsRangeSnapshot>();
    [...ranges, ...(currentRange ? [currentRange] : [])].forEach((range) => {
      const existing = uniqueRanges.get(range.id);
      if (!existing || range.publishedAt > existing.publishedAt) uniqueRanges.set(range.id, range);
    });

    return Array.from(uniqueRanges.values()).sort((left, right) => {
      const leftDuration = Date.parse(`${left.endDate}T00:00:00.000Z`) - Date.parse(`${left.startDate}T00:00:00.000Z`);
      const rightDuration =
        Date.parse(`${right.endDate}T00:00:00.000Z`) - Date.parse(`${right.startDate}T00:00:00.000Z`);
      return rightDuration - leftDuration || right.publishedAt - left.publishedAt;
    })[0];
  }
  if (rangeKey !== 'custom') return ranges.find((range) => range.rangeKey === rangeKey);

  const startDate = getDateKey(customRange.start);
  const endDate = getDateKey(customRange.end);
  const exact = ranges.find((range) => range.id === getContentAnalyticsRangeId('custom', startDate, endDate));
  if (exact) return exact;

  return ranges
    .filter((range) => range.startDate <= startDate && range.endDate >= endDate)
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
}

/**
 * Builds the six cards. A metric LinkedIn did not report renders as a dash,
 * never as a zero, so an unavailable source is visibly different from a real
 * zero.
 */
export function buildContentMetricCards(range: ContentAnalyticsRangeSnapshot | undefined): ContentMetricCardModel[] {
  return CONTENT_METRICS.map((definition) => {
    const value = range?.metrics[definition.key];
    const coverage = range?.coverage[definition.key];
    const available = coverage !== 'unavailable' && (typeof value === 'number' || value === null);
    return {
      ...definition,
      value: available ? formatContentMetricValue(definition.key, value) : '—',
      available,
    };
  });
}

export interface ContentAnalyticsNotice {
  tone: 'info' | 'warning' | 'blocked';
  message: string;
}

export function shouldShowContentAnalyticsConnectionPrompt({
  loading,
  hasPublishedData,
  syncStatusLoaded,
  extensionError,
}: {
  loading: boolean;
  hasPublishedData: boolean;
  syncStatusLoaded: boolean;
  extensionError: string | null;
}): boolean {
  return !loading && !hasPublishedData && syncStatusLoaded && Boolean(extensionError);
}

/**
 * Describes a stale or partial run without hiding the cached values already
 * on screen.
 */
export function getContentAnalyticsNotice({
  manifest,
  localContentStatus,
  extensionError,
  hasCachedData,
}: {
  manifest: DashboardAnalyticsSyncManifest | null;
  localContentStatus?: DashboardAnalyticsSourceStatus;
  extensionError: string | null;
  hasCachedData: boolean;
}): ContentAnalyticsNotice | null {
  if (extensionError && !hasCachedData) {
    return {
      tone: 'info',
      message: 'Install or enable the myFeedPilot extension to collect your LinkedIn content analytics.',
    };
  }

  if (!hasCachedData && localContentStatus?.status === 'syncing') {
    return {
      tone: 'info',
      message: 'Collecting LinkedIn Content Analytics. This can take a few seconds.',
    };
  }
  if (!hasCachedData && (!localContentStatus || localContentStatus.status === 'idle')) {
    return {
      tone: 'info',
      message: 'Content Analytics has not been collected yet. Keep LinkedIn open and refresh this page to start sync.',
    };
  }

  const content =
    localContentStatus?.status === 'failed' || localContentStatus?.status === 'blocked'
      ? localContentStatus
      : manifest?.content;
  if (content?.status === 'blocked') {
    return {
      tone: 'blocked',
      message: content.message || 'LinkedIn temporarily limited analytics requests. Showing the last saved data.',
    };
  }
  if (content?.status === 'failed' || content?.status === 'partial') {
    return {
      tone: 'warning',
      message: content.message || 'Some Content Analytics could not be refreshed. Showing the last saved data.',
    };
  }
  if (manifest?.postEnrichment?.status === 'partial') {
    return { tone: 'warning', message: 'Post details are still being collected in the background.' };
  }
  return null;
}
