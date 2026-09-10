import type {
  ContentAnalyticsDailySnapshot,
  ContentAnalyticsRangeKey,
  ContentAnalyticsRangeSnapshot,
  ContentAnalyticsSnapshot,
  DashboardAnalyticsRunState,
  DashboardAnalyticsSourceStatus,
  DashboardAnalyticsSyncManifest,
} from 'shared/types';

export interface DashboardAnalyticsPublishInput {
  userId: string;
  syncRunId: string;
  trigger: string;
  startedAt: number;
  publishedAt: number;
  defaultRangeKey: ContentAnalyticsRangeKey;
  profile: DashboardAnalyticsSourceStatus;
  content: DashboardAnalyticsSourceStatus;
  postEnrichment?: DashboardAnalyticsSourceStatus;
  connectionHistory?: DashboardAnalyticsSourceStatus;
  ranges: ContentAnalyticsRangeSnapshot[];
  daily: ContentAnalyticsDailySnapshot[];
  /** Only present when the content core produced a fresh range this run. */
  currentRange?: ContentAnalyticsRangeSnapshot;
  postsCount?: number;
  contentSourceUrl?: string;
}

/**
 * Derives the run status from its sources. A source that was skipped or is
 * still idle never turns a healthy run into a failure.
 */
export function deriveDashboardAnalyticsStatus(
  statuses: Array<DashboardAnalyticsSourceStatus | undefined>
): DashboardAnalyticsRunState {
  const present = statuses.filter((status): status is DashboardAnalyticsSourceStatus => Boolean(status));
  const states = present.map((status) => status.status);
  if (states.includes('syncing')) return 'syncing';

  const succeeded = states.filter((status) => status === 'success').length;
  const failed = states.filter((status) => status === 'failed').length;
  const blocked = states.filter((status) => status === 'blocked').length;
  const partial = states.filter((status) => status === 'partial').length;

  if (failed === 0 && blocked === 0 && partial === 0) return succeeded > 0 ? 'success' : 'partial';
  if (succeeded > 0 || partial > 0) return 'partial';
  return blocked > 0 ? 'blocked' : 'failed';
}

export function buildDashboardAnalyticsManifest(input: DashboardAnalyticsPublishInput): DashboardAnalyticsSyncManifest {
  return {
    syncRunId: input.syncRunId,
    status: deriveDashboardAnalyticsStatus([
      input.profile,
      input.content,
      input.postEnrichment,
      input.connectionHistory,
    ]),
    trigger: input.trigger,
    startedAt: input.startedAt,
    finishedAt: input.publishedAt,
    publishedAt: input.publishedAt,
    profile: input.profile,
    content: input.content,
    postEnrichment: input.postEnrichment,
    connectionHistory: input.connectionHistory,
  };
}

export function buildContentAnalyticsSnapshot(input: DashboardAnalyticsPublishInput): ContentAnalyticsSnapshot {
  return {
    defaultRangeKey: input.defaultRangeKey,
    range: input.currentRange,
    postsCount: input.postsCount,
    syncRunId: input.syncRunId,
    capturedAt: input.content.capturedAt || input.publishedAt,
    publishedAt: input.publishedAt,
    updatedAt: input.publishedAt,
    sourceUrl: input.contentSourceUrl,
  };
}
