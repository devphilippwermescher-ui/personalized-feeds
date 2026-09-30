import {
  CONNECTION_INVITE_FIRST_CHECK_DELAY_MS,
  getProfileAnalyticsSnapshot,
  migrateLegacyProfileAnalyticsStorage,
} from 'shared/firestore-service';
import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import { getAuthenticatedFeedsUser } from '../auth/services/authenticated-user';
import { getProfileAnalyticsHistoryRequestResult } from '../profile-analytics/profile-analytics-history-request-result';
import { getProfileViewersSyncState } from '../profile-viewers/profile-viewers-coordinator-storage';
import { isProfileViewersFirstSurfaceReady } from '../profile-viewers/profile-viewers-sync-state';
import { getActiveLinkedInHeavySyncLock } from '../../platform/linkedin/heavy-sync-lock';
import { selectLinkedInExecutionTabs } from '../../platform/linkedin/tab-selection';
import {
  PROFILE_ANALYTICS_ATTEMPT_LEASE_MS,
  getProfileAnalyticsScheduledIntervalMs,
} from '../profile-analytics/profile-analytics-sync-policy';
import {
  finishProfileAnalyticsSyncState,
  recoverInterruptedProfileAnalyticsState,
} from '../profile-analytics/profile-analytics-sync-runtime';
import { classifyDashboardAnalyticsFailure } from './dashboard-analytics-errors';
import { publishContentAnalyticsPosts, publishDashboardAnalyticsRun } from './dashboard-analytics-publisher';
import {
  CONTENT_ANALYTICS_DEFAULT_RANGE,
  selectPendingDashboardAnalyticsRequest,
  type DashboardAnalyticsSyncRequest,
  type DashboardAnalyticsSyncState,
  type DashboardAnalyticsSyncTrigger,
} from './dashboard-analytics-sync-policy';
import {
  createSyncRunId,
  getNextDashboardAnalyticsAlarmAt,
  logDashboardAnalyticsPlan,
  scheduleDashboardAnalyticsAlarm,
} from './dashboard-analytics-sync-runtime';
import {
  loadDashboardAnalyticsSyncState,
  setStoredDashboardAnalyticsSyncState,
} from './dashboard-analytics-sync-storage';
import { runContentCore, runProfileCore } from './dashboard-analytics-core-tasks';
import { runConnectionHistory, runDueContentPostEnrichment } from './dashboard-analytics-heavy-tasks';

export interface DashboardAnalyticsSyncResult {
  ran: boolean;
  success: boolean;
  syncRunId: string;
  currentSynced: boolean;
  contentSynced: boolean;
  historySynced: boolean;
  reason: 'fresh' | 'no_auth' | 'no_linkedin_tab' | 'profile_viewers_pending' | 'synced' | 'failed';
  error?: string;
}

let activeSync: Promise<DashboardAnalyticsSyncResult> | null = null;
let activeSyncRequest: DashboardAnalyticsSyncRequest | null = null;
let pendingSyncRequest: DashboardAnalyticsSyncRequest | null = null;
const observedLinkedInTabIds = new Set<number>();

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

  // An authenticated extension entry is remembered even when Sidebar data is
  // not ready yet. A later Profile Visitors alarm can then finish the sidebar
  // bootstrap and let this coordinator create the one-time Connections job.
  let state = recoverInterruptedProfileAnalyticsState(
    await loadDashboardAnalyticsSyncState(user.uid)
  ) as DashboardAnalyticsSyncState;
  if (trigger === 'first_extension_entry' && !state.firstExtensionEntryAt) {
    state.firstExtensionEntryAt = Date.now();
    await setStoredDashboardAnalyticsSyncState(state);
  }

  const profileViewersState = await getProfileViewersSyncState(user.uid);
  if (!isProfileViewersFirstSurfaceReady(profileViewersState)) {
    console.info('[dashboard-analytics] deferred until Profile Visitors bootstrap completes', {
      trigger,
      backfillStatus: profileViewersState.backfillStatus,
      privateSummaryStatus: profileViewersState.privateSummaryStatus,
    });
    return {
      ran: false,
      success: true,
      syncRunId,
      currentSynced: false,
      contentSynced: false,
      historySynced: false,
      reason: 'profile_viewers_pending',
    };
  }

  const linkedInTabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  const availableLinkedInTabs = selectLinkedInExecutionTabs(linkedInTabs, preferredTabId);
  const linkedInTab = availableLinkedInTabs[0];
  const linkedInTabIds = availableLinkedInTabs.map((tab) => tab.id);
  const startedAt = Date.now();

  await migrateLegacyProfileAnalyticsStorage(user.uid);
  let snapshot = await getProfileAnalyticsSnapshot(user.uid);

  if (trigger === 'invite_sent') {
    const firstCheckAt = startedAt + CONNECTION_INVITE_FIRST_CHECK_DELAY_MS;
    state.acceptanceNextDueAt = state.acceptanceNextDueAt
      ? Math.min(state.acceptanceNextDueAt, firstCheckAt)
      : firstCheckAt;
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
  const postEnrichment = await runDueContentPostEnrichment({
    userId: user.uid,
    linkedInTabId: linkedInTab?.id,
    posts: contentCore.posts,
    state,
    capturedAt: publishedAt,
    heavySyncLocked: Boolean(heavySyncLock),
  });
  state = postEnrichment.state;

  // 5. Continue an existing one-time connection-history job. Creation is owned
  //    by the first authenticated extension entry, never by a routine sync.
  const connectionHistory = await runConnectionHistory({
    userId: user.uid,
    linkedInTabId: linkedInTab?.id,
    state,
    snapshot,
    trigger,
    startedAt,
  });
  state = connectionHistory.state;
  snapshot = connectionHistory.snapshot;
  const historySynced = connectionHistory.historySynced;

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

  if (postEnrichment.status || connectionHistory.status) {
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
        postEnrichment: postEnrichment.status,
        connectionHistory: connectionHistory.status,
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
  if (!DASHBOARD_ANALYTICS_SYNC_ENABLED) {
    return Promise.resolve({
      ran: false,
      success: true,
      syncRunId: 'dashboard-disabled',
      currentSynced: false,
      contentSynced: false,
      historySynced: false,
      reason: 'fresh',
    });
  }

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
