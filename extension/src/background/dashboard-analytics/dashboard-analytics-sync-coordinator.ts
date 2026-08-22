import {
  CONNECTION_INVITE_FIRST_CHECK_DELAY_MS,
  getProfileAnalyticsSnapshot,
  migrateLegacyProfileAnalyticsStorage,
} from 'shared/firestore-service';
import type {
  ContentAnalyticsDailySnapshot,
  ContentAnalyticsPost,
  ContentAnalyticsRangeKey,
  ContentAnalyticsRangeSnapshot,
  DashboardAnalyticsSourceStatus,
  ProfileAnalyticsSnapshot,
  ProfileAnalyticsSyncMetric,
} from 'shared/types';
import { getAuthenticatedFeedsUser } from '../feeds-auth';
import { getActiveLinkedInHeavySyncLock } from '../linkedin-heavy-sync-lock';
import { selectLinkedInExecutionTabs } from '../linkedin-tab-selection';
import { runDueAcceptanceTask } from '../profile-analytics-acceptance-task';
import { runProfileAnalyticsBootstrapTask } from '../profile-analytics-bootstrap-task';
import { runSearchAppearancesTask, runSocialSellingIndexTask } from '../profile-analytics-daily-sync-tasks';
import { getProfileAnalyticsHistoryRequestResult } from '../profile-analytics-history-request-result';
import { runConnectionHistoryTask } from '../profile-analytics-history-task';
import { runProfileAnalyticsNetworkTask } from '../profile-analytics-network-task';
import { runProfileAnalyticsMetadataTask } from '../profile-analytics-metadata-task';
import {
  PROFILE_ANALYTICS_ATTEMPT_LEASE_MS,
  getProfileAnalyticsScheduledIntervalMs,
} from '../profile-analytics-sync-policy';
import {
  finishProfileAnalyticsSyncState,
  recoverInterruptedProfileAnalyticsState,
} from '../profile-analytics-sync-runtime';
import { resolveConnectionHistoryJob } from './connection-history-bootstrap-gate';
import { runContentAnalyticsPostEnrichmentTask } from './content-analytics-post-enrichment-task';
import { runContentAnalyticsRangeTask } from './content-analytics-sync-task';
import {
  classifyDashboardAnalyticsFailure,
  redactDiagnosticText,
} from './dashboard-analytics-errors';
import { publishContentAnalyticsPosts, publishDashboardAnalyticsRun } from './dashboard-analytics-publisher';
import {
  CONTENT_ANALYTICS_DEFAULT_RANGE,
  CONTENT_ANALYTICS_RESTRICTION_RETRY_MS,
  CONTENT_ANALYTICS_RETRY_DELAY_MS,
  getContentAnalyticsScheduledIntervalMs,
  getContentAnalyticsState,
  isContentAnalyticsCoreDue,
  isContentAnalyticsPostEnrichmentDue,
  selectDueContentAnalyticsLongRanges,
  selectPendingDashboardAnalyticsRequest,
  type DashboardAnalyticsSyncRequest,
  CONTENT_ANALYTICS_LONG_RANGE_TTL_MS,
  CONTENT_ANALYTICS_POST_ENRICHMENT_INTERVAL_MS,
  type ContentAnalyticsSyncState,
  type DashboardAnalyticsSyncState,
  type DashboardAnalyticsSyncTrigger,
} from './dashboard-analytics-sync-policy';
import {
  createSyncRunId,
  getNextDashboardAnalyticsAlarmAt,
  logDashboardAnalyticsPlan,
  scheduleDashboardAnalyticsAlarm,
  toSourceStatusFromError,
} from './dashboard-analytics-sync-runtime';
import {
  loadDashboardAnalyticsSyncState,
  setStoredDashboardAnalyticsSyncState,
} from './dashboard-analytics-sync-storage';

export interface DashboardAnalyticsSyncResult {
  ran: boolean;
  success: boolean;
  syncRunId: string;
  currentSynced: boolean;
  contentSynced: boolean;
  historySynced: boolean;
  reason: 'fresh' | 'no_auth' | 'no_linkedin_tab' | 'synced' | 'failed';
  error?: string;
}

interface ContentCoreOutcome {
  status: DashboardAnalyticsSourceStatus;
  ranges: ContentAnalyticsRangeSnapshot[];
  daily: ContentAnalyticsDailySnapshot[];
  posts: ContentAnalyticsPost[];
  currentRange?: ContentAnalyticsRangeSnapshot;
  contentState: ContentAnalyticsSyncState;
  sourceUrl?: string;
}

let activeSync: Promise<DashboardAnalyticsSyncResult> | null = null;
let activeSyncRequest: DashboardAnalyticsSyncRequest | null = null;
let pendingSyncRequest: DashboardAnalyticsSyncRequest | null = null;
const observedLinkedInTabIds = new Set<number>();

/**
 * Runs the fast Profile Analytics core.
 *
 * These are single-request metrics, so they run on every routine sync even
 * while the Connections-history lock is held. Only heavy LinkedIn work waits
 * for that lock.
 */
async function runProfileCore({
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
async function runContentCore({
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
      failure.retryKind === 'restriction'
        ? CONTENT_ANALYTICS_RESTRICTION_RETRY_MS
        : CONTENT_ANALYTICS_RETRY_DELAY_MS;
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

async function runDashboardAnalyticsSync(
  trigger: DashboardAnalyticsSyncTrigger,
  preferredTabId?: number
): Promise<DashboardAnalyticsSyncResult> {
  const syncRunId = createSyncRunId();
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    return {
      ran: false,
      success: false,
      syncRunId,
      currentSynced: false,
      contentSynced: false,
      historySynced: false,
      reason: 'no_auth',
    };
  }

  const linkedInTabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  const availableLinkedInTabs = selectLinkedInExecutionTabs(linkedInTabs, preferredTabId);
  const linkedInTab = availableLinkedInTabs[0];
  const linkedInTabIds = availableLinkedInTabs.map((tab) => tab.id);
  const startedAt = Date.now();

  let state = recoverInterruptedProfileAnalyticsState(
    await loadDashboardAnalyticsSyncState(user.uid)
  ) as DashboardAnalyticsSyncState;
  await migrateLegacyProfileAnalyticsStorage(user.uid);
  let snapshot = await getProfileAnalyticsSnapshot(user.uid);

  if (trigger === 'invite_sent') {
    const firstCheckAt = startedAt + CONNECTION_INVITE_FIRST_CHECK_DELAY_MS;
    state.acceptanceNextDueAt = state.acceptanceNextDueAt
      ? Math.min(state.acceptanceNextDueAt, firstCheckAt)
      : firstCheckAt;
  }
  if (trigger === 'first_extension_entry' && !state.firstExtensionEntryAt) {
    state.firstExtensionEntryAt = startedAt;
  }

  state = {
    ...state,
    lastSyncRunId: syncRunId,
    attemptStartedAt: startedAt,
    attemptExpiresAt: startedAt + PROFILE_ANALYTICS_ATTEMPT_LEASE_MS,
    status: { ...state.status, status: 'syncing', trigger, startedAt, finishedAt: undefined },
  };
  await setStoredDashboardAnalyticsSyncState(state);

  const heavySyncLock = await getActiveLinkedInHeavySyncLock(user.uid);
  console.info('[dashboard-analytics] sync run started', {
    syncRunId,
    trigger,
    linkedInTabCount: availableLinkedInTabs.length,
    selectedTabId: linkedInTab?.id,
    heavyLockHeld: Boolean(heavySyncLock),
  });

  // 1. Fast Profile Analytics core - never postponed by the heavy lock.
  const profileCore = await runProfileCore({
    userId: user.uid,
    state,
    snapshot,
    trigger,
    linkedInTab,
    linkedInTabIds,
    startedAt,
  });
  state = profileCore.state;
  snapshot = profileCore.snapshot;

  // 2. Fast Content Analytics core - also independent of the heavy lock.
  const contentCore = await runContentCore({
    state,
    snapshot,
    trigger,
    linkedInTabId: linkedInTab?.id,
    syncRunId,
    startedAt,
  });
  state = { ...state, content: contentCore.contentState };

  // 3. Coherent publish of both fast cores under one sync run.
  const publishedAt = Date.now();
  let publishError: unknown;
  try {
    await publishDashboardAnalyticsRun({
      userId: user.uid,
      syncRunId,
      trigger,
      startedAt,
      publishedAt,
      defaultRangeKey: CONTENT_ANALYTICS_DEFAULT_RANGE,
      profile: profileCore.status,
      content: contentCore.status,
      ranges: contentCore.ranges,
      daily: contentCore.daily,
      currentRange: contentCore.currentRange,
      postsCount: contentCore.currentRange?.metrics.posts,
      contentSourceUrl: contentCore.sourceUrl,
    });
    await publishContentAnalyticsPosts(user.uid, contentCore.posts);
  } catch (error) {
    publishError = error;
    console.warn('[dashboard-analytics] publish failed', {
      syncRunId,
      errorCode: classifyDashboardAnalyticsFailure(error).errorCode,
    });
  }

  // 4. Optional bounded post enrichment - heavy, so it yields to the lock.
  let postEnrichmentStatus: DashboardAnalyticsSourceStatus | undefined;
  if (
    !heavySyncLock &&
    contentCore.posts.length > 0 &&
    isContentAnalyticsPostEnrichmentDue({ now: publishedAt, state })
  ) {
    const enrichment = await runContentAnalyticsPostEnrichmentTask({
      linkedInTabId: linkedInTab?.id,
      posts: contentCore.posts,
      enrichment: getContentAnalyticsState(state).postEnrichment,
      now: publishedAt,
    });
    state = {
      ...state,
      content: {
        ...getContentAnalyticsState(state),
        postEnrichment: {
          ...enrichment.enrichment,
          nextDueAt: publishedAt + CONTENT_ANALYTICS_POST_ENRICHMENT_INTERVAL_MS,
          lastErrorCode: enrichment.lastErrorCode as ContentAnalyticsSyncState['lastErrorCode'],
        },
      },
    };
    try {
      await publishContentAnalyticsPosts(user.uid, enrichment.posts);
    } catch (error) {
      console.warn('[dashboard-analytics] post enrichment write failed', {
        errorCode: classifyDashboardAnalyticsFailure(error).errorCode,
      });
    }
    postEnrichmentStatus = {
      status:
        enrichment.succeeded === enrichment.attempted
          ? 'success'
          : enrichment.succeeded > 0
            ? 'partial'
            : 'failed',
      capturedAt: publishedAt,
      lastSuccessAt: enrichment.succeeded > 0 ? publishedAt : undefined,
      errorCode: enrichment.lastErrorCode,
    };
  }

  // 5. Continue an existing one-time connection-history job. Creation is owned
  //    by the first authenticated extension entry, never by a routine sync.
  const historyAccess = await resolveConnectionHistoryJob({
    userId: user.uid,
    profile: snapshot?.profile,
    trigger,
    now: startedAt,
  });
  let historySynced = false;
  let connectionHistoryStatus: DashboardAnalyticsSourceStatus | undefined;
  if (historyAccess.job) {
    const historyTask = await runConnectionHistoryTask({
      state,
      snapshot,
      trigger: trigger === 'first_extension_entry' ? 'sign_in' : trigger,
      linkedInTabId: linkedInTab?.id,
      job: historyAccess.job,
    });
    state = historyTask.state as DashboardAnalyticsSyncState;
    snapshot = historyTask.snapshot;
    historySynced = historyTask.historySynced;
    connectionHistoryStatus = {
      status: historyTask.state.historyLastError ? 'partial' : historySynced ? 'success' : 'syncing',
      capturedAt: historyTask.state.historyLastAttemptAt,
      lastSuccessAt: historyTask.state.historyCompletedAt,
      nextRetryAt: historyTask.state.historyNextRetryAt,
      message: historyTask.state.historyLastError
        ? redactDiagnosticText(historyTask.state.historyLastError)
        : undefined,
    };
  }

  const now = Date.now();
  if (!state.networkNextDueAt && !state.networkNextRetryAt) {
    state.networkNextDueAt = now + getProfileAnalyticsScheduledIntervalMs();
  }
  const remainingHeavySyncLock = await getActiveLinkedInHeavySyncLock(user.uid, now);
  // Even while history owns LinkedIn, the next alarm must still be able to
  // refresh the fast Profile and Content cores.
  const nextScheduledAt = Math.min(
    getNextDashboardAnalyticsAlarmAt(state, now),
    remainingHeavySyncLock ? state.historyNextRetryAt || remainingHeavySyncLock.expiresAt : Number.POSITIVE_INFINITY
  );
  state = finishProfileAnalyticsSyncState(
    state,
    trigger === 'first_extension_entry' ? 'sign_in' : trigger,
    startedAt,
    Array.from(new Set(profileCore.metrics)),
    nextScheduledAt
  ) as DashboardAnalyticsSyncState;
  await setStoredDashboardAnalyticsSyncState(state);
  await scheduleDashboardAnalyticsAlarm(nextScheduledAt, 'next_due_check');
  logDashboardAnalyticsPlan(state, nextScheduledAt);

  if (postEnrichmentStatus || connectionHistoryStatus) {
    // Re-publish the manifest so late sources describe the same run.
    try {
      await publishDashboardAnalyticsRun({
        userId: user.uid,
        syncRunId,
        trigger,
        startedAt,
        publishedAt,
        defaultRangeKey: CONTENT_ANALYTICS_DEFAULT_RANGE,
        profile: profileCore.status,
        content: contentCore.status,
        postEnrichment: postEnrichmentStatus,
        connectionHistory: connectionHistoryStatus,
        ranges: [],
        daily: [],
        currentRange: contentCore.currentRange,
        postsCount: contentCore.currentRange?.metrics.posts,
        contentSourceUrl: contentCore.sourceUrl,
      });
    } catch (error) {
      console.warn('[dashboard-analytics] manifest update failed', {
        errorCode: classifyDashboardAnalyticsFailure(error).errorCode,
      });
    }
  }

  const historyRequestResult = getProfileAnalyticsHistoryRequestResult({
    trigger: trigger === 'first_extension_entry' ? 'sign_in' : trigger,
    hasLinkedInTab: typeof linkedInTab?.id === 'number',
    historyStatus: snapshot?.profile?.connectionHistoryBootstrap?.status,
    historyLastError: state.historyLastError,
  });
  if (historyRequestResult) {
    return {
      ...historyRequestResult,
      syncRunId,
      currentSynced: profileCore.currentSynced,
      contentSynced: contentCore.status.status === 'success' || contentCore.status.status === 'partial',
      historySynced,
    };
  }

  const contentSynced = contentCore.ranges.length > 0;
  const ran = profileCore.metrics.length > 0 || contentSynced || historySynced;
  const noLinkedInTab =
    profileCore.status.errorCode === 'no_linkedin_tab' || contentCore.status.errorCode === 'no_linkedin_tab';
  return {
    ran,
    success: !publishError && profileCore.status.status !== 'failed' && contentCore.status.status !== 'failed',
    syncRunId,
    currentSynced: profileCore.currentSynced,
    contentSynced,
    historySynced,
    reason: noLinkedInTab ? 'no_linkedin_tab' : ran ? 'synced' : 'fresh',
  };
}

/** Deduplicates Dashboard Analytics work; other extension domains are independent. */
export function queueDashboardAnalyticsSync(
  trigger: DashboardAnalyticsSyncTrigger,
  preferredTabId?: number
): Promise<DashboardAnalyticsSyncResult> {
  const request: DashboardAnalyticsSyncRequest = { trigger, preferredTabId };
  if (activeSync && activeSyncRequest) {
    pendingSyncRequest = selectPendingDashboardAnalyticsRequest(activeSyncRequest, pendingSyncRequest, request);
    return activeSync;
  }

  activeSyncRequest = request;
  activeSync = runDashboardAnalyticsSync(trigger, preferredTabId).finally(() => {
    activeSync = null;
    activeSyncRequest = null;
    const followUpRequest = pendingSyncRequest;
    pendingSyncRequest = null;
    if (followUpRequest) {
      void queueDashboardAnalyticsSync(followUpRequest.trigger, followUpRequest.preferredTabId);
    }
  });
  return activeSync;
}

export function queueDashboardAnalyticsForLinkedInActivity(tabId?: number): Promise<DashboardAnalyticsSyncResult> {
  const firstActivityForLinkedInSession = typeof tabId === 'number' && observedLinkedInTabIds.size === 0;
  if (typeof tabId === 'number') observedLinkedInTabIds.add(tabId);
  return queueDashboardAnalyticsSync(firstActivityForLinkedInSession ? 'linkedin_open' : 'linkedin_activity', tabId);
}

export function forgetDashboardAnalyticsLinkedInTab(tabId: number): void {
  observedLinkedInTabIds.delete(tabId);
}
