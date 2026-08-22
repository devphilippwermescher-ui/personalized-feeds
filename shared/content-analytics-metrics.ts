import type {
  ContentAnalyticsMetricCoverage,
  ContentAnalyticsMetricValues,
  ContentAnalyticsRangeKey,
} from './types';

export const CONTENT_ANALYTICS_RANGE_DAYS: Record<Exclude<ContentAnalyticsRangeKey, 'custom'>, number> = {
  '30d': 30,
  '90d': 90,
  '6m': 183,
  '1y': 365,
};

/**
 * Engagement Rate, product variant B.
 *
 * Numerator is strictly `reactions + comments + reposts`. LinkedIn's own
 * "Engagements" aggregate, saves, sends, custom-button clicks, and link clicks
 * are deliberately excluded: they are stored separately and never folded in.
 *
 * Returns `null` when the rate is undefined (no impressions) so the UI can
 * render an honest dash instead of a fake `0%`, and `undefined` when the
 * inputs themselves were never collected.
 */
export function calculateEngagementRate(
  metrics: Pick<ContentAnalyticsMetricValues, 'impressions' | 'reactions' | 'comments' | 'reposts'>
): number | null | undefined {
  const socialCounts = [metrics.reactions, metrics.comments, metrics.reposts];
  if (typeof metrics.impressions !== 'number' || socialCounts.every((value) => typeof value !== 'number')) {
    return undefined;
  }
  if (metrics.impressions <= 0) return null;

  const engagements = socialCounts.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
  return (engagements / metrics.impressions) * 100;
}

/**
 * Weighted aggregate across a range: summed numerators over summed
 * impressions. This is intentionally not the mean of per-post percentages.
 */
export function aggregateEngagementRate(
  entries: Array<Pick<ContentAnalyticsMetricValues, 'impressions' | 'reactions' | 'comments' | 'reposts'>>
): number | null | undefined {
  const totals = entries.reduce<{
    impressions: number;
    reactions: number;
    comments: number;
    reposts: number;
    seen: boolean;
  }>(
    (accumulator, entry) => ({
      impressions: accumulator.impressions + (entry.impressions || 0),
      reactions: accumulator.reactions + (entry.reactions || 0),
      comments: accumulator.comments + (entry.comments || 0),
      reposts: accumulator.reposts + (entry.reposts || 0),
      seen: accumulator.seen || typeof entry.impressions === 'number',
    }),
    { impressions: 0, reactions: 0, comments: 0, reposts: 0, seen: false }
  );
  if (!totals.seen) return undefined;
  return calculateEngagementRate(totals);
}

/** Metric values a source did not report are dropped rather than zero-filled. */
export function mergeContentAnalyticsMetrics(
  base: ContentAnalyticsMetricValues | undefined,
  patch: ContentAnalyticsMetricValues | undefined
): ContentAnalyticsMetricValues {
  const merged: ContentAnalyticsMetricValues = { ...(base || {}) };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    Reflect.set(merged, key, value);
  });
  return merged;
}

export function mergeContentAnalyticsCoverage(
  base: ContentAnalyticsMetricCoverage | undefined,
  patch: ContentAnalyticsMetricCoverage | undefined
): ContentAnalyticsMetricCoverage {
  return { ...(base || {}), ...(patch || {}) };
}

/** Stable Firestore document id for one collected range window. */
export function getContentAnalyticsRangeId(
  rangeKey: ContentAnalyticsRangeKey,
  startDate: string,
  endDate: string
): string {
  return rangeKey === 'custom' ? `custom_${startDate}_${endDate}` : rangeKey;
}

/**
 * Canonical post key. LinkedIn exposes the same post as `urn:li:activity:*`
 * and `urn:li:share:*`; both collapse onto the numeric activity id so one post
 * can never be stored twice.
 */
export function getContentAnalyticsPostId(activityUrn: string): string {
  const numeric = activityUrn.match(/(\d{6,})/);
  return numeric ? numeric[1] : activityUrn.replace(/[^\w-]/g, '_');
}
