import { DashboardAnalyticsError } from './dashboard-analytics-errors';

/**
 * Adapters for LinkedIn sources whose request contract has not been verified
 * from a real capture yet.
 *
 * They deliberately fail with `source_unavailable` instead of guessing an
 * endpoint: a fabricated request would surface as fake zeros on the dashboard.
 * Each becomes a real implementation once its request/response pair is
 * captured.
 */
export const CONTENT_ANALYTICS_SLOW_METRICS_REQUEST_ID =
  'com.linkedin.sdui.requests.creatoranalytics.caSlowMetrics';

export interface ContentAnalyticsSlowMetrics {
  membersReached?: number;
  inNetworkImpressions?: number;
  outOfNetworkImpressions?: number;
}

/**
 * Members reached and the in/out-of-network split. LinkedIn issues this as a
 * follow-up SDUI server request once the screen is visible; only its response
 * has been captured so far, never the request envelope.
 */
export function fetchContentAnalyticsSlowMetrics(): Promise<ContentAnalyticsSlowMetrics> {
  return Promise.reject(
    new DashboardAnalyticsError(
      'source_unavailable',
      'LinkedIn slow metrics need a verified request contract before they can be collected.'
    )
  );
}

export interface ContentAnalyticsExportWindow {
  startDate: string;
  endDate: string;
}

/**
 * The aggregate export is the only known candidate for exact daily reactions,
 * comments and reposts. The Content Analytics response exposes the modal's
 * `{ startDate, endDate }` payload but no export request or response has been
 * captured, so this stays unavailable rather than being invented.
 */
export function fetchContentAnalyticsDailySocialExport(
  _window: ContentAnalyticsExportWindow
): Promise<never> {
  return Promise.reject(
    new DashboardAnalyticsError(
      'source_unavailable',
      'Exact daily social metrics need a verified LinkedIn export capture.'
    )
  );
}
