import { HiOutlineSparkles } from 'react-icons/hi2';

/**
 * Insights has no verified LinkedIn source yet. It states that plainly rather
 * than showing placeholder analytics that would look real.
 */
export function ContentAnalyticsInsightsPanel() {
  return (
    <div className="content-analytics-insights">
      <div className="content-analytics-insights-icon">
        <HiOutlineSparkles />
      </div>
      <h2>Insights are in development</h2>
      <p>
        Audience demographics, network reach and content recommendations are being built. Your Content tab keeps
        collecting data in the meantime.
      </p>
    </div>
  );
}
