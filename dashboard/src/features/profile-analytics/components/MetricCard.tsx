import type { ReactNode } from 'react';
import { InfoTooltip } from '../../../components/InfoTooltip';

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  rangeLabel: string;
  tone: 'blue' | 'cyan' | 'mint' | 'sky' | 'violet' | 'amber';
  tooltip?: string;
  tooltipPlacement?: 'left' | 'right';
  loading?: boolean;
}

export function MetricCard({
  icon,
  label,
  value,
  rangeLabel,
  tone,
  tooltip,
  tooltipPlacement = 'left',
  loading = false,
}: MetricCardProps) {
  return (
    <div className="profile-analytics-metric">
      <div className={`profile-analytics-metric-icon profile-analytics-metric-icon--${tone}`}>{icon}</div>
      <div className="profile-analytics-metric-copy">
        {loading ? (
          <div
            className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--value"
            aria-label={`Collecting ${label} history from LinkedIn`}
          />
        ) : (
          <div className="profile-analytics-metric-value">{value}</div>
        )}
        <div className="profile-analytics-metric-label">
          {label} <span>({rangeLabel})</span>
          {tooltip ? (
            <InfoTooltip label={`About ${label} data`} content={tooltip} placement={tooltipPlacement} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
