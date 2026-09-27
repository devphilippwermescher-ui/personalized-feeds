import type { ProfileAnalyticsSyncStatus } from './profile-analytics';

export type DashboardAnalyticsSourceState =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'partial'
  | 'failed'
  | 'blocked'
  | 'skipped';

export interface DashboardAnalyticsSourceStatus {
  status: DashboardAnalyticsSourceState;
  capturedAt?: number;
  lastSuccessAt?: number;
  nextRetryAt?: number;
  /** Stable machine code. Never contains cookies, tokens, or response bodies. */
  errorCode?: string;
  message?: string;
}

export type DashboardAnalyticsRunState = 'syncing' | 'success' | 'partial' | 'failed' | 'blocked';

export interface DashboardAnalyticsSyncManifest {
  syncRunId: string;
  status: DashboardAnalyticsRunState;
  trigger: string;
  startedAt: number;
  finishedAt?: number;
  publishedAt?: number;
  profile: DashboardAnalyticsSourceStatus;
  content: DashboardAnalyticsSourceStatus;
  postEnrichment?: DashboardAnalyticsSourceStatus;
  connectionHistory?: DashboardAnalyticsSourceStatus;
}

/** Extension-local progress polled by the dashboard between Firestore publishes. */
export interface DashboardAnalyticsSyncStatus extends ProfileAnalyticsSyncStatus {
  content?: DashboardAnalyticsSourceStatus;
}
