import type { ContentAnalyticsMetric } from 'shared/types';
import { MetricTrendChart } from '../../../components/MetricTrendChart';
import { formatNumber } from '../../../utils/format';
import { CONTENT_METRICS } from '../constants';
import { formatEngagementRate } from '../hooks/useContentAnalyticsViewModel';
import type { ContentMetricSeries } from '../types';

interface ContentMetricChartProps {
  selectedMetric: ContentAnalyticsMetric;
  series: ContentMetricSeries;
  rangeLabel: string;
  showYear: boolean;
  onSelect: (metric: ContentAnalyticsMetric) => void;
}

function MetricTabs({
  selectedMetric,
  onSelect,
}: Pick<ContentMetricChartProps, 'selectedMetric' | 'onSelect'>) {
  return (
    <div className="content-analytics-chart-tabs" role="tablist" aria-label="Chart metric">
      {CONTENT_METRICS.map((metric) => (
        <button
          key={metric.key}
          type="button"
          role="tab"
          aria-selected={metric.key === selectedMetric}
          className={`content-analytics-chart-tab${metric.key === selectedMetric ? ' is-active' : ''}`}
          onClick={() => onSelect(metric.key)}
        >
          {metric.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The single trend chart. The plot itself is the shared MetricTrendChart; only
 * the header, its metric tabs and the value formatting are Content-specific.
 */
export function ContentMetricChart({
  selectedMetric,
  series,
  rangeLabel,
  showYear,
  onSelect,
}: ContentMetricChartProps) {
  const definition = CONTENT_METRICS.find((metric) => metric.key === selectedMetric) || CONTENT_METRICS[0];
  const isPercent = definition.kind === 'percent';

  return (
    <MetricTrendChart
      className="content-analytics-chart"
      title={definition.label}
      summary={`· ${rangeLabel}`}
      icon={<span className="content-analytics-chart-dot" style={{ background: definition.color }} />}
      headerActions={<MetricTabs selectedMetric={selectedMetric} onSelect={onSelect} />}
      points={series.points}
      color={definition.color}
      smooth
      smallestChartMax={1}
      gradientId={`contentAnalytics-${definition.key}-gradient`}
      valueFormatter={
        isPercent ? formatEngagementRate : (value) => (typeof value === 'number' ? formatNumber(value) : '—')
      }
      emptyLabel={series.emptyLabel}
      showYear={showYear}
      showEmptyPlot={series.available}
    />
  );
}
