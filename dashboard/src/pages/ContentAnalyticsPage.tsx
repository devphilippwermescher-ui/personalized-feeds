import { useState } from 'react';
import { ContentAnalyticsHeader } from '../features/content-analytics/components/ContentAnalyticsHeader';
import { ContentAnalyticsConnectionPrompt } from '../features/content-analytics/components/ContentAnalyticsConnectionPrompt';
import { ContentAnalyticsInsightsPanel } from '../features/content-analytics/components/ContentAnalyticsInsightsPanel';
import { ContentAnalyticsSkeleton } from '../features/content-analytics/components/ContentAnalyticsSkeleton';
import { ContentAnalyticsSyncNotice } from '../features/content-analytics/components/ContentAnalyticsSyncNotice';
import { ContentAnalyticsTabs } from '../features/content-analytics/components/ContentAnalyticsTabs';
import { ContentMetricCards } from '../features/content-analytics/components/ContentMetricCards';
import { ContentMetricChart } from '../features/content-analytics/components/ContentMetricChart';
import { ContentPostsSection } from '../features/content-analytics/components/ContentPostsSection';
import { useContentAnalyticsDateRange } from '../features/content-analytics/hooks/useContentAnalyticsDateRange';
import { useContentAnalyticsTab } from '../features/content-analytics/hooks/useContentAnalyticsTab';
import { useContentAnalyticsViewModel } from '../features/content-analytics/hooks/useContentAnalyticsViewModel';
import type { ContentAnalyticsPostsView } from '../features/content-analytics/types';

interface ContentAnalyticsPageProps {
  userId: string;
}

export default function ContentAnalyticsPage({ userId }: ContentAnalyticsPageProps) {
  const { tab, selectTab } = useContentAnalyticsTab();
  const dateRange = useContentAnalyticsDateRange();
  const [postsView, setPostsView] = useState<ContentAnalyticsPostsView>('table');
  const analytics = useContentAnalyticsViewModel({
    userId,
    rangeKey: dateRange.range,
    customRange: dateRange.customRange,
    rangeLabel: dateRange.rangeLabel,
  });

  return (
    <div className="content-analytics-page">
      <ContentAnalyticsTabs activeTab={tab} onSelect={selectTab} />

      {tab === 'insights' ? (
        <div
          id="content-analytics-panel-insights"
          className="content-analytics-panel content-analytics-panel--insights"
          role="tabpanel"
          aria-labelledby="content-analytics-tab-insights"
        >
          <ContentAnalyticsInsightsPanel />
        </div>
      ) : (
        <div
          id="content-analytics-panel-content"
          className="content-analytics-panel content-analytics-panel--content"
          role="tabpanel"
          aria-labelledby="content-analytics-tab-content"
        >
          <ContentAnalyticsHeader
            range={dateRange.range}
            customRange={dateRange.customRange}
            isCustomPickerOpen={dateRange.isCustomPickerOpen}
            activeBoundary={dateRange.activeCustomBoundary}
            visibleMonth={dateRange.visibleMonth}
            onPresetSelect={dateRange.selectPreset}
            onCustomToggle={dateRange.toggleCustomPicker}
            onCustomClose={dateRange.closeCustomPicker}
            onVisibleMonthChange={dateRange.setVisibleMonth}
            onActiveBoundaryChange={dateRange.setActiveCustomBoundary}
            onCustomRangeChange={dateRange.updateCustomRange}
            onReset={dateRange.reset}
          />

          <ContentAnalyticsSyncNotice
            manifest={analytics.syncManifest}
            localContentStatus={analytics.syncStatus?.content}
            extensionError={analytics.syncStatusError}
            hasCachedData={analytics.hasPublishedData}
          />

          {analytics.error ? (
            <div className="profile-analytics-alert profile-analytics-alert--error">{analytics.error}</div>
          ) : null}

          {analytics.showSkeleton ? (
            <ContentAnalyticsSkeleton />
          ) : analytics.showConnectionPrompt ? (
            <ContentAnalyticsConnectionPrompt />
          ) : (
            <>
              <ContentMetricCards
                cards={analytics.metricCards}
                rangeLabel={dateRange.rangeLabel}
                selectedMetric={analytics.selectedMetric}
                onSelect={analytics.setSelectedMetric}
              />

              <ContentMetricChart
                selectedMetric={analytics.selectedMetric}
                series={analytics.chartSeries}
                rangeLabel={dateRange.rangeLabel}
                showYear={dateRange.range === 'total' || dateRange.range === '1y' || dateRange.range === 'custom'}
                onSelect={analytics.setSelectedMetric}
              />

              <ContentPostsSection
                rows={analytics.postRows}
                totalCount={analytics.totalPostCount}
                searchTerm={analytics.searchTerm}
                view={postsView}
                onSearchChange={analytics.setSearchTerm}
                onViewChange={setPostsView}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
