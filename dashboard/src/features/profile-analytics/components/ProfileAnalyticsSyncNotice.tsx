import type {
  ProfileAnalyticsSyncMetric,
  ProfileAnalyticsSyncMetricStatus,
  ProfileAnalyticsSyncStatus,
} from 'shared/types';
import { HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';

const METRIC_LABELS: Record<ProfileAnalyticsSyncMetric, string> = {
  profileMetadata: 'Profile details',
  connections: 'Connections',
  followers: 'Followers',
  acceptanceRate: 'Acceptance Rate',
  searchAppearances: 'Search Appearances',
  socialSellingIndex: 'SSI',
};

function formatTime(timestamp: number | undefined): string | undefined {
  if (!timestamp) return undefined;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function getFailedMetrics(status: ProfileAnalyticsSyncStatus) {
  return (
    Object.entries(status.metrics) as Array<[ProfileAnalyticsSyncMetric, ProfileAnalyticsSyncMetricStatus | undefined]>
  ).filter((entry): entry is [ProfileAnalyticsSyncMetric, ProfileAnalyticsSyncMetricStatus] => {
    return entry[1]?.status === 'failed' || entry[1]?.status === 'blocked';
  });
}

export function ProfileAnalyticsSyncNotice({
  status,
  extensionError,
  hasSearchAppearancesValue,
}: {
  status: ProfileAnalyticsSyncStatus | null;
  extensionError: string | null;
  hasSearchAppearancesValue: boolean;
}) {
  if (extensionError) {
    return (
      <div className="profile-analytics-sync-notice profile-analytics-sync-notice--warning" role="status">
        <span>
          Open LinkedIn in this browser and make sure the myFeedPilot extension is enabled. Showing the last saved
          data until the account is connected.
          {import.meta.env.DEV ? <small>{extensionError}</small> : null}
        </span>
        <a href="https://www.linkedin.com/feed/" target="_blank" rel="noreferrer">
          Open LinkedIn
          <HiOutlineArrowTopRightOnSquare />
        </a>
      </div>
    );
  }

  if (!status || status.status === 'idle' || status.status === 'success') return null;

  if (status.status === 'syncing') {
    return (
      <div className="profile-analytics-sync-notice profile-analytics-sync-notice--info" role="status">
        Updating Profile Analytics from LinkedIn…
      </div>
    );
  }

  const failedMetrics = getFailedMetrics(status).filter(([metric, metricStatus]) => {
    // A new LinkedIn account can omit the Search Appearances module entirely.
    // With no previously stored value this is an unavailable initial metric,
    // not stale data that the user needs to act on.
    return !(
      metric === 'searchAppearances' &&
      !hasSearchAppearancesValue &&
      metricStatus.errorCode === 'linkedin_response_missing_data'
    );
  });
  if (failedMetrics.length === 0) return null;
  const metricNames = failedMetrics.map(([metric]) => METRIC_LABELS[metric]).join(', ');
  const firstFailure = failedMetrics[0][1];
  const failureText = `${firstFailure.errorCode || ''} ${firstFailure.message || ''} ${
    firstFailure.technicalMessage || ''
  }`.toLowerCase();
  const shouldOfferLinkedInLink =
    failureText.includes('linkedin') &&
    (failureText.includes('reach') || failureText.includes('tab') || failureText.includes('available'));
  const lastSuccessAt = Math.max(0, ...failedMetrics.map(([, metric]) => metric.lastSuccessAt || 0));
  const nextRetryAt = Math.min(...failedMetrics.map(([, metric]) => metric.nextRetryAt || Number.POSITIVE_INFINITY));
  const lastSuccessLabel = formatTime(lastSuccessAt);
  const nextRetryLabel = Number.isFinite(nextRetryAt) ? formatTime(nextRetryAt) : undefined;

  return (
    <div
      className={`profile-analytics-sync-notice profile-analytics-sync-notice--${
        status.status === 'blocked' ? 'blocked' : 'warning'
      }`}
      role="status"
    >
      <span>
        {metricNames} could not be refreshed. {firstFailure.message || 'Showing the last saved data.'}
        {lastSuccessLabel ? ` Last successful update: ${lastSuccessLabel}.` : ''}
        {nextRetryLabel ? ` Next retry: ${nextRetryLabel}.` : ''}
      </span>
      {shouldOfferLinkedInLink ? (
        <a href="https://www.linkedin.com/feed/" target="_blank" rel="noreferrer">
          Open LinkedIn
          <HiOutlineArrowTopRightOnSquare />
        </a>
      ) : null}
      {import.meta.env.DEV ? (
        <details>
          <summary>Details</summary>
          {failedMetrics.map(([metric, metricStatus]) => (
            <small key={metric}>
              {METRIC_LABELS[metric]}: {metricStatus.errorCode || 'sync_failed'}
              {metricStatus.technicalMessage ? ` — ${metricStatus.technicalMessage}` : ''}
            </small>
          ))}
        </details>
      ) : null}
    </div>
  );
}
