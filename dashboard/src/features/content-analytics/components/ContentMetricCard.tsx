import type { ContentAnalyticsMetric } from 'shared/types';
import type { ContentMetricCardModel } from '../types';

interface ContentMetricCardProps {
  card: ContentMetricCardModel;
  icon: React.ReactNode;
  rangeLabel: string;
  isSelected: boolean;
  loading?: boolean;
  onSelect: (metric: ContentAnalyticsMetric) => void;
}

/**
 * A metric card doubles as the chart selector, so the card and the chart tabs
 * always describe the same metric.
 */
export function ContentMetricCard({
  card,
  icon,
  rangeLabel,
  isSelected,
  loading = false,
  onSelect,
}: ContentMetricCardProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      className={`content-analytics-metric${isSelected ? ' is-selected' : ''}`}
      onClick={() => onSelect(card.key)}
    >
      <span className={`content-analytics-metric-icon content-analytics-metric-icon--${card.tone}`}>{icon}</span>
      <span className="content-analytics-metric-copy">
        {loading ? (
          <span
            className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--value"
            aria-label={`Loading ${card.label}`}
          />
        ) : (
          <span className="content-analytics-metric-value">{card.value}</span>
        )}
        <span className="content-analytics-metric-label">
          {card.label} <span>({rangeLabel})</span>
        </span>
      </span>
    </button>
  );
}
