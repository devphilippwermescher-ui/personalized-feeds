import type { DashboardAnalyticsSourceStatus, DashboardAnalyticsSyncManifest } from 'shared/types';
import { getContentAnalyticsNotice } from '../utils/content-view-model';

interface ContentAnalyticsSyncNoticeProps {
  manifest: DashboardAnalyticsSyncManifest | null;
  localContentStatus?: DashboardAnalyticsSourceStatus;
  extensionError: string | null;
  hasCachedData: boolean;
}

/**
 * Explains staleness and partial runs without hiding the cached values the
 * page is already showing.
 */
export function ContentAnalyticsSyncNotice(props: ContentAnalyticsSyncNoticeProps) {
  const notice = getContentAnalyticsNotice(props);
  if (!notice) return null;

  return (
    <div className={`profile-analytics-sync-notice profile-analytics-sync-notice--${notice.tone}`}>
      <span>{notice.message}</span>
      {props.manifest?.publishedAt ? (
        <small>Last saved {new Date(props.manifest.publishedAt).toLocaleString()}</small>
      ) : null}
    </div>
  );
}
