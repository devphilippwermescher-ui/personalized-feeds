import type {
  ContentAnalyticsDailySnapshot,
  ContentAnalyticsPost,
  ContentAnalyticsRangeKey,
  ContentAnalyticsRangeSnapshot,
  DashboardAnalyticsSourceStatus,
  ProfileAnalyticsSnapshot,
  ProfileAnalyticsSyncMetric,
} from 'shared/types';
import { CONTENT_ANALYTICS_ENABLED } from 'shared/feature-flags';
import { runDueAcceptanceTask } from '../profile-analytics/profile-analytics-acceptance-task';
import { runProfileAnalyticsBootstrapTask } from '../profile-analytics/profile-analytics-bootstrap-task';
import {
  runSearchAppearancesTask,
  runSocialSellingIndexTask,
} from '../profile-analytics/profile-analytics-daily-sync-tasks';
import { runProfileAnalyticsNetworkTask } from '../profile-analytics/profile-analytics-network-task';
import { runProfileAnalyticsMetadataTask } from '../profile-analytics/profile-analytics-metadata-task';
import { runContentAnalyticsRangeTask } from './content-analytics-sync-task';
import { classifyDashboardAnalyticsFailure, redactDiagnosticText } from './dashboard-analytics-errors';
import {
  CONTENT_ANALYTICS_DEFAULT_RANGE,
  CONTENT_ANALYTICS_LONG_RANGE_TTL_MS,
  CONTENT_ANALYTICS_RESTRICTION_RETRY_MS,
  CONTENT_ANALYTICS_RETRY_DELAY_MS,
  getContentAnalyticsScheduledIntervalMs,
  getContentAnalyticsState,
  isContentAnalyticsCoreDue,
  selectDueContentAnalyticsLongRanges,
  type ContentAnalyticsSyncState,
  type DashboardAnalyticsSyncState,
  type DashboardAnalyticsSyncTrigger,
} from './dashboard-analytics-sync-policy';
import { toSourceStatusFromError } from './dashboard-analytics-sync-runtime';

export interface ContentCoreOutcome {
  status: DashboardAnalyticsSourceStatus;
  ranges: ContentAnalyticsRangeSnapshot[];
  daily: ContentAnalyticsDailySnapshot[];
  posts: ContentAnalyticsPost[];
  currentRange?: ContentAnalyticsRangeSnapshot;
  contentState: ContentAnalyticsSyncState;
  sourceUrl?: string;
}

/**
 * Runs the fast Profile Analytics core.
 *
 * These are single-request metrics, so they run on every routine sync even
 * while the Connections-history lock is held. Only heavy LinkedIn work waits
 * for that lock.
 */
export async function runProfileCore({
  userId,
  state,
  snapshot,
  trigger,
  linkedInTab,
  linkedInTabIds,
  startedAt,
}: {
  userId: string;
  state: DashboardAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: DashboardAnalyticsSyncTrigger;
  linkedInTab: chrome.tabs.Tab | undefined;
  linkedInTabIds: number[];
  startedAt: number;
}): Promise<{
  state: DashboardAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  currentSynced: boolean;
  metrics: ProfileAnalyticsSyncMetric[];
  status: DashboardAnalyticsSourceStatus;
}> {
  let nextState = state;
  let nextSnapshot = snapshot;
  let currentSynced = false;
  const metrics: ProfileAnalyticsSyncMetric[] = [];
  const profileTrigger = trigger === 'first_extension_entry' ? 'sign_in' : trigger;

  const bootstrap = await runProfileAnalyticsBootstrapTask({
    state: nextState,
    snapshot: nextSnapshot,
    trigger: profileTrigger,
    linkedInTabId: linkedInTab?.id,
    startedAt,
  });
  nextState = bootstrap.state as DashboardAnalyticsSyncState;
  nextSnapshot = bootstrap.snapshot;
  currentSynced = bootstrap.currentSynced;
  metrics.push(...bootstrap.metrics);

  const metadataTask = await runProfileAnalyticsMetadataTask({
    userId,
    state: nextState,
    snapshot: nextSnapshot,
    trigger: profileTrigger,
    linkedInTabId: linkedInTab?.id,
    startedAt,
    bootstrapRan: bootstrap.currentSynced,
  });
  nextState = metadataTask.state as DashboardAnalyticsSyncState;
  nextSnapshot = metadataTask.snapshot;
  currentSynced = currentSynced || metadataTask.currentSynced;
  metrics.push(...metadataTask.metrics);

  const networkTask = await runProfileAnalyticsNetworkTask({
    userId,
    state: nextState,
    snapshot: nextSnapshot,
    trigger: profileTrigger,
    linkedInTabIds,
    startedAt,
  });
  nextState = networkTask.state as DashboardAnalyticsSyncState;
  nextSnapshot = networkTask.snapshot;
  currentSynced = currentSynced || networkTask.currentSynced;
  metrics.push(...networkTask.metrics);

  const acceptanceTask = await runDueAcceptanceTask({
    userId,
    state: nextState,
    snapshot: nextSnapshot,
    trigger: profileTrigger,
    startedAt,
  });
  nextState = acceptanceTask.state as DashboardAnalyticsSyncState;
  currentSynced = currentSynced || acceptanceTask.currentSynced;
  metrics.push(...acceptanceTask.metrics);

  const searchTask = await runSearchAppearancesTask({
    userId,
    state: nextState,
    snapshot: nextSnapshot,
    trigger: profileTrigger,
    startedAt,
  });
  nextState = searchTask.state as DashboardAnalyticsSyncState;
  nextSnapshot = searchTask.snapshot;
  metrics.push(...searchTask.metrics);

  const ssiTask = await runSocialSellingIndexTask({
    userId,
    state: nextState,
    snapshot: nextSnapshot,
    trigger: profileTrigger,
    linkedInTabId: linkedInTab?.id,
    startedAt,
  });
  nextState = ssiTask.state as DashboardAnalyticsSyncState;
  nextSnapshot = ssiTask.snapshot;
  metrics.push(...ssiTask.metrics);

  const failedMetrics = Object.values(nextState.status.metrics).filter(
    (metric) => metric?.status === 'failed' || metric?.status === 'blocked'
  );
  const status: DashboardAnalyticsSourceStatus = {
    status:
      failedMetrics.length === 0
        ? metrics.length > 0 || currentSynced
          ? 'success'
          : 'skipped'
        : metrics.length > 0
          ? 'partial'
          : failedMetrics.some((metric) => metric?.status === 'blocked')
            ? 'blocked'
            : 'failed',
    capturedAt: nextSnapshot?.updatedAt || startedAt,
    lastSuccessAt: nextState.networkLastSuccessAt,
    errorCode: failedMetrics[0]?.errorCode,
    message: failedMetrics[0]?.message ? redactDiagnosticText(failedMetrics[0].message) : undefined,
  };

  return { state: nextState, snapshot: nextSnapshot, currentSynced, metrics, status };
}

/** Fast Content Analytics core plus any long range whose own TTL is due. */
export async function runContentCore({
  state,
  snapshot,
  trigger,
  linkedInTabId,
  syncRunId,
  startedAt,
}: {
  state: DashboardAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: DashboardAnalyticsSyncTrigger;
  linkedInTabId: number | undefined;
  syncRunId: string;
  startedAt: number;
}): Promise<ContentCoreOutcome> {
  const content = getContentAnalyticsState(state);

  if (!CONTENT_ANALYTICS_ENABLED) {
    return {
      status: { status: 'skipped' },
      ranges: [],
      daily: [],
      posts: [],
      contentState: content,
    };
  }

  const profileUrn = snapshot?.profile?.profileUrn;

  if (!isContentAnalyticsCoreDue({ now: startedAt, state, trigger })) {
    return {
      status: { status: 'skipped', lastSuccessAt: content.lastSuccessAt, capturedAt: content.lastSuccessAt },
      ranges: [],
      daily: [],
      posts: [],
      contentState: content,
    };
  }

  const ranges: ContentAnalyticsRangeSnapshot[] = [];
  const daily: ContentAnalyticsDailySnapshot[] = [];
  const posts: ContentAnalyticsPost[] = [];
  let currentRange: ContentAnalyticsRangeSnapshot | undefined;
  let sourceUrl: string | undefined;
  let nextContent: ContentAnalyticsSyncState = { ...content, lastAttemptAt: startedAt };

  try {
    const core = await runContentAnalyticsRangeTask({
      linkedInTabId,
      profileUrn,
      rangeKey: CONTENT_ANALYTICS_DEFAULT_RANGE,
      syncRunId,
      now: startedAt,
    });
    ranges.push(core.range);
    daily.push(...core.daily);
    posts.push(...core.posts);
    currentRange = core.range;
    sourceUrl = core.range.sourceUrl;
    nextContent = {
      ...nextContent,
      lastSuccessAt: startedAt,
      nextDueAt: startedAt + getContentAnalyticsScheduledIntervalMs(),
      nextRetryAt: undefined,
      retryKind: undefined,
      lastErrorCode: undefined,
      ranges: {
        ...nextContent.ranges,
        [CONTENT_ANALYTICS_DEFAULT_RANGE]: {
          lastAttemptAt: startedAt,
          lastSuccessAt: startedAt,
          nextDueAt: startedAt + getContentAnalyticsScheduledIntervalMs(),
        },
      },
    };
  } catch (error) {
    const failure = classifyDashboardAnalyticsFailure(error);
    const retryDelay =
      failure.retryKind === 'restriction' ? CONTENT_ANALYTICS_RESTRICTION_RETRY_MS : CONTENT_ANALYTICS_RETRY_DELAY_MS;
    console.warn('[dashboard-analytics] content core failed', {
      trigger,
      errorCode: failure.errorCode,
      message: redactDiagnosticText(failure.message),
    });
    return {
      // The previously published range stays untouched; nothing is blanked out.
      status: toSourceStatusFromError(error, startedAt + retryDelay),
      ranges: [],
      daily: [],
      posts: [],
      contentState: {
        ...nextContent,
        nextRetryAt: startedAt + retryDelay,
        retryKind: failure.retryKind,
        lastErrorCode: failure.errorCode,
      },
    };
  }

  const dueLongRanges = selectDueContentAnalyticsLongRanges({ now: startedAt, state });
  const longRangeErrors: ContentAnalyticsRangeKey[] = [];
  for (const rangeKey of dueLongRanges) {
    try {
      const result = await runContentAnalyticsRangeTask({
        linkedInTabId,
        profileUrn,
        rangeKey,
        syncRunId,
        now: startedAt,
      });
      ranges.push(result.range);
      nextContent = {
        ...nextContent,
        ranges: {
          ...nextContent.ranges,
          [rangeKey]: {
            lastAttemptAt: startedAt,
            lastSuccessAt: startedAt,
            nextDueAt: startedAt + CONTENT_ANALYTICS_LONG_RANGE_TTL_MS,
          },
        },
      };
    } catch (error) {
      const failure = classifyDashboardAnalyticsFailure(error);
      longRangeErrors.push(rangeKey);
      // A stale long range never blocks the fresh 30-day current snapshot.
      nextContent = {
        ...nextContent,
        ranges: {
          ...nextContent.ranges,
          [rangeKey]: {
            ...nextContent.ranges[rangeKey],
            lastAttemptAt: startedAt,
            nextRetryAt:
              startedAt +
              (failure.retryKind === 'restriction'
                ? CONTENT_ANALYTICS_RESTRICTION_RETRY_MS
                : CONTENT_ANALYTICS_RETRY_DELAY_MS),
            lastErrorCode: failure.errorCode,
          },
        },
      };
    }
  }

  return {
    status: {
      status: longRangeErrors.length > 0 ? 'partial' : 'success',
      capturedAt: startedAt,
      lastSuccessAt: startedAt,
      errorCode: longRangeErrors.length > 0 ? 'source_unavailable' : undefined,
      message:
        longRangeErrors.length > 0
          ? `Longer ranges (${longRangeErrors.join(', ')}) will retry on their own schedule.`
          : undefined,
    },
    ranges,
    daily,
    posts,
    currentRange,
    contentState: nextContent,
    sourceUrl,
  };
}
