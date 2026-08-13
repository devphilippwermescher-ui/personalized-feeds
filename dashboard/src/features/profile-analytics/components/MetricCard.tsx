import { useId, type ReactNode } from 'react';
import { HiOutlineInformationCircle } from 'react-icons/hi2';

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  rangeLabel: string;
  tone: 'blue' | 'cyan' | 'mint' | 'sky' | 'violet' | 'amber';
  tooltip?: string;
  loading?: boolean;
}

export function MetricCard({ icon, label, value, rangeLabel, tone, tooltip, loading = false }: MetricCardProps) {
  const tooltipId = useId();

  return (
    <div className="profile-analytics-metric">
      <div className={`profile-analytics-metric-icon profile-analytics-metric-icon--${tone}`}>{icon}</div>
      <div>
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
            <span className="profile-analytics-info-tooltip-wrap">
              <button
                className="profile-analytics-info-trigger"
                type="button"
                aria-label={`About ${label} data`}
                aria-describedby={tooltipId}
              >
                <HiOutlineInformationCircle />
              </button>
              <span id={tooltipId} className="profile-analytics-info-tooltip" role="tooltip">
                {tooltip}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
