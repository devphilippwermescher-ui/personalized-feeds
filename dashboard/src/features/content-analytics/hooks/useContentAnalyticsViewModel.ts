import { useMemo, useState } from 'react';
import type { ContentAnalyticsMetric } from 'shared/types';
import type { ActiveContentRangeKey, ContentMetricSeries, ContentPostRow } from '../types';
import { buildContentMetricSeries } from '../utils/content-metric-series';
import { buildContentPostRows, searchContentPostRows } from '../utils/content-posts-view';
import {
  buildContentMetricCards,
  hasPublishedContentAnalyticsData,
  selectContentRangeSnapshot,
  shouldShowContentAnalyticsConnectionPrompt,
} from '../utils/content-view-model';
import { useContentAnalytics } from './useContentAnalytics';

export { formatEngagementRate } from '../utils/content-view-model';

/**
 * Composes everything the page renders: the active range snapshot, the six
 * metric cards, the selected chart series, and the searchable post rows.
 */
export function useContentAnalyticsViewModel({
  userId,
  rangeKey,
  customRange,
  rangeLabel,
}: {
  userId: string;
  rangeKey: ActiveContentRangeKey;
  customRange: { start: Date; end: Date };
  rangeLabel: string;
}) {
  const analytics = useContentAnalytics(userId);
  const [selectedMetric, setSelectedMetric] = useState<ContentAnalyticsMetric>('posts');
  const [searchTerm, setSearchTerm] = useState('');

  const activeRange = useMemo(
    () => selectContentRangeSnapshot(analytics.ranges, rangeKey, customRange, analytics.snapshot?.range),
    [analytics.ranges, analytics.snapshot?.range, customRange, rangeKey]
  );

  const metricCards = useMemo(() => buildContentMetricCards(activeRange), [activeRange]);

  const chartSeries = useMemo<ContentMetricSeries>(
    () =>
      buildContentMetricSeries({
        metric: selectedMetric,
        dailySnapshots: analytics.dailySnapshots,
        range: activeRange,
      }),
    [activeRange, analytics.dailySnapshots, selectedMetric]
  );

  const allPostRows = useMemo<ContentPostRow[]>(
    () => buildContentPostRows(analytics.posts, activeRange),
    [activeRange, analytics.posts]
  );
  const postRows = useMemo(() => searchContentPostRows(allPostRows, searchTerm), [allPostRows, searchTerm]);

  const hasPublishedData = hasPublishedContentAnalyticsData(analytics.snapshot, analytics.ranges);
  const contentSourceStatus = analytics.syncManifest?.content;

  return {
    ...analytics,
    activeRange,
    isTotalRange: rangeKey === 'total',
    rangeLabel,
    metricCards,
    selectedMetric,
    setSelectedMetric,
    chartSeries,
    postRows,
    totalPostCount: allPostRows.length,
    searchTerm,
    setSearchTerm,
    hasPublishedData,
    contentSourceStatus,
    /** A first paint with neither cache nor Firestore data yet. */
    showSkeleton: analytics.loading && !hasPublishedData,
    // No collected data is a valid first-run state. Only replace it with the
    // connection prompt after the extension bridge itself has actually failed.
    showConnectionPrompt: shouldShowContentAnalyticsConnectionPrompt({
      loading: analytics.loading,
      hasPublishedData,
      syncStatusLoaded: analytics.syncStatusLoaded,
      extensionError: analytics.syncStatusError,
    }),
  };
}
