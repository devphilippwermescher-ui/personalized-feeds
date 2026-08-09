const METRIC_SKELETONS = Array.from({ length: 6 }, (_, index) => index);
const CHART_SKELETONS = Array.from({ length: 5 }, (_, index) => index);

export function ProfileAnalyticsSkeleton() {
  return (
    <div className="profile-analytics-skeleton" aria-label="Loading profile analytics" aria-busy="true">
      <section className="profile-analytics-skeleton-hero">
        <div className="profile-analytics-skeleton-block profile-analytics-skeleton-cover" />
        <div className="profile-analytics-skeleton-profile">
          <div className="profile-analytics-skeleton-block profile-analytics-skeleton-avatar" />
          <div className="profile-analytics-skeleton-profile-copy">
            <div className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--title" />
            <div className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--wide" />
            <div className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--meta" />
          </div>
        </div>
      </section>

      <div className="profile-analytics-skeleton-heading">
        <div>
          <div className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--heading" />
          <div className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--subtitle" />
        </div>
        <div className="profile-analytics-skeleton-range">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="profile-analytics-skeleton-block profile-analytics-skeleton-pill" />
          ))}
        </div>
      </div>

      <div className="profile-analytics-metrics-grid">
        {METRIC_SKELETONS.map((index) => (
          <div key={index} className="profile-analytics-metric profile-analytics-skeleton-metric">
            <div className="profile-analytics-skeleton-block profile-analytics-skeleton-icon" />
            <div className="profile-analytics-skeleton-metric-copy">
              <div className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--value" />
              <div className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--label" />
            </div>
          </div>
        ))}
      </div>

      <div className="profile-analytics-chart-grid">
        {CHART_SKELETONS.map((index) => (
          <div
            key={index}
            className={`profile-analytics-card profile-analytics-skeleton-chart${index === 0 ? ' profile-analytics-card--wide' : ''}`}
          >
            <div className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--chart-title" />
            <div className="profile-analytics-skeleton-block profile-analytics-skeleton-chart-body" />
          </div>
        ))}
      </div>
    </div>
  );
}
