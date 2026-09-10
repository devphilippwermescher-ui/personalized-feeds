import { CONTENT_ANALYTICS_ENABLED } from 'shared/feature-flags';
import type { ContentAnalyticsPost, DashboardAnalyticsSourceStatus, ProfileAnalyticsSnapshot } from 'shared/types';
import { runConnectionHistoryTask } from '../profile-analytics/profile-analytics-history-task';
import { runContentAnalyticsPostEnrichmentTask } from './content-analytics-post-enrichment-task';
import { resolveConnectionHistoryJob } from './connection-history-bootstrap-gate';
import { classifyDashboardAnalyticsFailure, redactDiagnosticText } from './dashboard-analytics-errors';
import { publishContentAnalyticsPosts } from './dashboard-analytics-publisher';
import {
  CONTENT_ANALYTICS_POST_ENRICHMENT_INTERVAL_MS,
  getContentAnalyticsState,
  isContentAnalyticsPostEnrichmentDue,
  type ContentAnalyticsSyncState,
  type DashboardAnalyticsSyncState,
  type DashboardAnalyticsSyncTrigger,
} from './dashboard-analytics-sync-policy';

export async function runDueContentPostEnrichment({
  userId,
  linkedInTabId,
  posts,
  state,
  capturedAt,
  heavySyncLocked,
}: {
  userId: string;
  linkedInTabId?: number;
  posts: ContentAnalyticsPost[];
  state: DashboardAnalyticsSyncState;
  capturedAt: number;
  heavySyncLocked: boolean;
}): Promise<{
  state: DashboardAnalyticsSyncState;
  status?: DashboardAnalyticsSourceStatus;
}> {
  if (
    !CONTENT_ANALYTICS_ENABLED ||
    heavySyncLocked ||
    posts.length === 0 ||
    !isContentAnalyticsPostEnrichmentDue({ now: capturedAt, state })
  ) {
    return { state };
  }

  const enrichment = await runContentAnalyticsPostEnrichmentTask({
    linkedInTabId,
    posts,
    enrichment: getContentAnalyticsState(state).postEnrichment,
    now: capturedAt,
  });
  const nextState: DashboardAnalyticsSyncState = {
    ...state,
    content: {
      ...getContentAnalyticsState(state),
      postEnrichment: {
        ...enrichment.enrichment,
        nextDueAt: capturedAt + CONTENT_ANALYTICS_POST_ENRICHMENT_INTERVAL_MS,
        lastErrorCode: enrichment.lastErrorCode as ContentAnalyticsSyncState['lastErrorCode'],
      },
    },
  };

  try {
    await publishContentAnalyticsPosts(userId, enrichment.posts);
  } catch (error) {
    console.warn('[dashboard-analytics] post enrichment write failed', {
      errorCode: classifyDashboardAnalyticsFailure(error).errorCode,
    });
  }

  return {
    state: nextState,
    status: {
      status:
        enrichment.succeeded === enrichment.attempted ? 'success' : enrichment.succeeded > 0 ? 'partial' : 'failed',
      capturedAt,
      lastSuccessAt: enrichment.succeeded > 0 ? capturedAt : undefined,
      errorCode: enrichment.lastErrorCode,
    },
  };
}

export async function runConnectionHistory({
  userId,
  linkedInTabId,
  state,
  snapshot,
  trigger,
  startedAt,
}: {
  userId: string;
  linkedInTabId?: number;
  state: DashboardAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: DashboardAnalyticsSyncTrigger;
  startedAt: number;
}): Promise<{
  state: DashboardAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  historySynced: boolean;
  status?: DashboardAnalyticsSourceStatus;
}> {
  const historyAccess = await resolveConnectionHistoryJob({
    userId,
    profile: snapshot?.profile,
    // Creation is still authorized only by a real extension entry. If that
    // entry happened while Profile Visitors were incomplete, preserve the
    // authorization and create the job on the first safe later wake.
    trigger: state.firstExtensionEntryAt ? 'first_extension_entry' : trigger,
    now: startedAt,
  });
  if (!historyAccess.job) {
    return { state, snapshot, historySynced: false };
  }

  const historyTask = await runConnectionHistoryTask({
    state,
    snapshot,
    trigger: trigger === 'first_extension_entry' ? 'sign_in' : trigger,
    linkedInTabId,
    job: historyAccess.job,
  });
  const nextState = historyTask.state as DashboardAnalyticsSyncState;
  return {
    state: nextState,
    snapshot: historyTask.snapshot,
    historySynced: historyTask.historySynced,
    status: {
      status: historyTask.state.historyLastError ? 'partial' : historyTask.historySynced ? 'success' : 'syncing',
      capturedAt: historyTask.state.historyLastAttemptAt,
      lastSuccessAt: historyTask.state.historyCompletedAt,
      nextRetryAt: historyTask.state.historyNextRetryAt,
      message: historyTask.state.historyLastError
        ? redactDiagnosticText(historyTask.state.historyLastError)
        : undefined,
    },
  };
}
