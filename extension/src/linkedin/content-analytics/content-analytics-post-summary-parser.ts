import type { ContentAnalyticsMetricCoverage, ContentAnalyticsMetricValues } from 'shared/types';
import { DashboardAnalyticsError } from '../../background/dashboard-analytics/dashboard-analytics-errors';
import { parseOrderedRscFlightRecords } from '../rsc-flight-records';
import { extractRscLabeledMetrics, type RscMetricDefinition } from './rsc-metric-rows';

export interface ContentAnalyticsPostSummaryResult {
  /**
   * Lifetime metrics for one post. LinkedIn's post-summary page is never
   * range-scoped, so these must not be merged into a range snapshot.
   */
  metrics: ContentAnalyticsMetricValues;
  coverage: ContentAnalyticsMetricCoverage;
}

type PostSummaryKey = keyof ContentAnalyticsMetricValues;

const POST_SUMMARY_METRICS: Array<RscMetricDefinition<PostSummaryKey>> = [
  { label: 'impressions', key: 'impressions', layout: 'highlight' },
  { label: 'profile viewers from this post', key: 'profileViewersFromPost', layout: 'highlight' },
  { label: 'followers gained from this post', key: 'followersGained', layout: 'highlight' },
  { label: 'members reached', key: 'membersReached', layout: 'highlight' },
  { label: 'in-network impressions', key: 'inNetworkImpressions', layout: 'row' },
  { label: 'out-of-network impressions', key: 'outOfNetworkImpressions', layout: 'row' },
  { label: 'reactions', key: 'reactions', layout: 'row' },
  { label: 'comments', key: 'comments', layout: 'row' },
  { label: 'reposts', key: 'reposts', layout: 'row' },
  { label: 'saves', key: 'saves', layout: 'row' },
  { label: 'sends on linkedin', key: 'sends', layout: 'row' },
];

/**
 * Reads `flagship-web/analytics/post-summary/{activityUrn}`.
 *
 * Raises `unsupported_rsc_shape` when Impressions cannot be located so a
 * layout change is never published as a post with zero reach.
 */
export function parseContentAnalyticsPostSummary(payload: string): ContentAnalyticsPostSummaryResult {
  const records = parseOrderedRscFlightRecords(payload);
  if (records.length === 0) {
    throw new DashboardAnalyticsError('unsupported_rsc_shape', 'LinkedIn post summary returned no records.');
  }

  const values = extractRscLabeledMetrics(records, POST_SUMMARY_METRICS);
  if (values.impressions === undefined) {
    throw new DashboardAnalyticsError(
      'unsupported_rsc_shape',
      'LinkedIn post summary did not expose an Impressions total.'
    );
  }

  const metrics: ContentAnalyticsMetricValues = {};
  const coverage: ContentAnalyticsMetricCoverage = {};
  POST_SUMMARY_METRICS.forEach((definition) => {
    const value = values[definition.key];
    if (typeof value === 'number') {
      Reflect.set(metrics, definition.key, value);
      Reflect.set(coverage, definition.key, 'exact');
      return;
    }
    Reflect.set(coverage, definition.key, 'unavailable');
  });

  return { metrics, coverage };
}
