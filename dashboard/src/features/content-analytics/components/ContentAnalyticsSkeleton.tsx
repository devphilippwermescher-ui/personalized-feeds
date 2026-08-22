const SKELETON_CARDS = Array.from({ length: 6 }, (_, index) => index);

export function ContentAnalyticsSkeleton() {
  return (
    <div className="content-analytics-skeleton" aria-hidden>
      <div className="content-analytics-metrics-grid">
        {SKELETON_CARDS.map((index) => (
          <div key={index} className="content-analytics-metric is-skeleton">
            <span className="profile-analytics-skeleton-block content-analytics-skeleton-icon" />
            <span className="content-analytics-metric-copy">
              <span className="profile-analytics-skeleton-block profile-analytics-skeleton-line profile-analytics-skeleton-line--value" />
              <span className="profile-analytics-skeleton-block profile-analytics-skeleton-line" />
            </span>
          </div>
        ))}
      </div>
      <div className="profile-analytics-card content-analytics-skeleton-chart">
        <span className="profile-analytics-skeleton-block content-analytics-skeleton-plot" />
      </div>
    </div>
  );
}
