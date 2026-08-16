import type { ProfileAnalyticsConnectionHistoryBootstrap } from 'shared/types';

interface ProfileAnalyticsHistoryProgressProps {
  bootstrap: ProfileAnalyticsConnectionHistoryBootstrap | undefined;
}

function getProgress(bootstrap: ProfileAnalyticsConnectionHistoryBootstrap | undefined) {
  const expectedTotal = bootstrap?.expectedTotal;
  const collectedCount = bootstrap?.collectedCount;
  if (typeof expectedTotal !== 'number' || expectedTotal <= 0 || typeof collectedCount !== 'number') {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round((collectedCount / expectedTotal) * 100)));
}

export function ProfileAnalyticsHistoryProgress({ bootstrap }: ProfileAnalyticsHistoryProgressProps) {
  const progress = getProgress(bootstrap);
  const collectedCount = bootstrap?.collectedCount;
  const expectedTotal = bootstrap?.expectedTotal;

  return (
    <section
      className="profile-analytics-history-progress"
      role="status"
      aria-live="polite"
      aria-label="Collecting analytics history from LinkedIn"
    >
      <div className="profile-analytics-history-progress-copy">
        <div>
          <strong>Collecting your analytics history from LinkedIn</strong>
          <p>This may take some time. Current Total values are already available.</p>
        </div>
        <span className="profile-analytics-history-progress-value">
          {progress === null ? 'Preparing…' : `${progress}%`}
        </span>
      </div>
      <div
        className={`profile-analytics-history-progress-track${progress === null ? ' is-indeterminate' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress ?? undefined}
        aria-valuetext={progress === null ? 'Preparing history collection' : `${progress}% complete`}
      >
        <span
          className="profile-analytics-history-progress-fill"
          style={progress === null ? undefined : { width: `${progress}%` }}
        />
      </div>
      {typeof collectedCount === 'number' && typeof expectedTotal === 'number' && expectedTotal > 0 ? (
        <small>
          {Math.min(collectedCount, expectedTotal).toLocaleString()} of {expectedTotal.toLocaleString()} connections
          processed
        </small>
      ) : null}
    </section>
  );
}
