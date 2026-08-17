import {
  CONNECTION_INVITE_FIRST_CHECK_DELAY_MS,
  getProfileAnalyticsSnapshot,
  migrateLegacyProfileAnalyticsStorage,
} from 'shared/firestore-service';
import type { ProfileAnalyticsSyncMetric } from 'shared/types';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { runDueAcceptanceTask } from './profile-analytics-acceptance-task';
import { runProfileAnalyticsBootstrapTask } from './profile-analytics-bootstrap-task';
import { runSearchAppearancesTask, runSocialSellingIndexTask } from './profile-analytics-daily-sync-tasks';
import { runConnectionHistoryTask } from './profile-analytics-history-task';
import { runProfileAnalyticsNetworkTask } from './profile-analytics-network-task';
import { runProfileAnalyticsMetadataTask } from './profile-analytics-metadata-task';
import { getProfileAnalyticsHistoryRequestResult } from './profile-analytics-history-request-result';
import { getActiveLinkedInHeavySyncLock } from './linkedin-heavy-sync-lock';
import { getProfileViewersSyncState } from './profile-viewers-coordinator-storage';
import { isProfileViewersFirstSurfaceReady } from './profile-viewers-sync-state';
import { selectLinkedInExecutionTabs } from './linkedin-tab-selection';
import {
  createProfileAnalyticsSyncState,
  getProfileAnalyticsNetworkBudget,
  getProfileAnalyticsScheduledIntervalMs,
  PROFILE_ANALYTICS_ATTEMPT_LEASE_MS,
  PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS,
  selectPendingProfileAnalyticsRequest,
  type ProfileAnalyticsSyncRequest,
  type ProfileAnalyticsSyncTrigger,
} from './profile-analytics-sync-policy';
import {
  finishProfileAnalyticsSyncState,
  getNextProfileAnalyticsAlarmAt,
  getStoredProfileAnalyticsSyncState,
  recoverInterruptedProfileAnalyticsState,
  scheduleProfileAnalyticsAlarm,
  setStoredProfileAnalyticsSyncState,
  toIso,
} from './profile-analytics-sync-runtime';

export { getProfileAnalyticsSyncStatus, PROFILE_ANALYTICS_ALARM_NAME } from './profile-analytics-sync-runtime';

export type { ProfileAnalyticsSyncTrigger } from './profile-analytics-sync-policy';

export interface ProfileAnalyticsSyncResult {
  ran: boolean;
  success: boolean;
  currentSynced: boolean;
  historySynced: boolean;
  reason: 'fresh' | 'no_auth' | 'no_linkedin_tab' | 'synced' | 'failed';
  error?: string;
}

let activeSync: Promise<ProfileAnalyticsSyncResult> | null = null;
let activeSyncRequest: ProfileAnalyticsSyncRequest | null = null;
let pendingSyncRequest: ProfileAnalyticsSyncRequest | null = null;
const observedLinkedInTabIds = new Set<number>();

async function runProfileAnalyticsSync(
  trigger: ProfileAnalyticsSyncTrigger,
  preferredTabId?: number
): Promise<ProfileAnalyticsSyncResult> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    return { ran: false, success: false, currentSynced: false, historySynced: false, reason: 'no_auth' };
  }

  const linkedInTabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  const availableLinkedInTabs = selectLinkedInExecutionTabs(linkedInTabs, preferredTabId);
  const linkedInTab = availableLinkedInTabs[0];
  const linkedInTabIds = availableLinkedInTabs.map((tab) => tab.id);
  const startedAt = Date.now();
  let state = (await getStoredProfileAnalyticsSyncState(user.uid)) || createProfileAnalyticsSyncState(user.uid);
  state = recoverInterruptedProfileAnalyticsState(state);
  await migrateLegacyProfileAnalyticsStorage(user.uid);
  let snapshot = await getProfileAnalyticsSnapshot(user.uid);

  // On a brand-new account the sidebar is the first product surface. Keep the
  // heavier dashboard bootstrap behind the independent Profile Viewers
  // collector until both its visible backfill and hidden summary are ready.
  // Existing dashboard accounts are never blocked by this migration gate.
  if (!snapshot?.profile) {
    const profileViewersState = await getProfileViewersSyncState(user.uid);
    const sidebarReady = isProfileViewersFirstSurfaceReady(profileViewersState);

    if (!sidebarReady) {
      const nextCheckAt =
        profileViewersState.retryAt ||
        profileViewersState.cooldownUntil ||
        profileViewersState.nextDueAt ||
        startedAt + 30 * 60 * 1000;
      await scheduleProfileAnalyticsAlarm(nextCheckAt, 'profile_viewers_bootstrap');
      console.info('[profile-analytics] first-time bootstrap deferred until Profile Viewers is ready', {
        trigger,
        backfillStatus: profileViewersState.backfillStatus,
        privateSummaryStatus: profileViewersState.privateSummaryStatus,
        nextCheckAt,
        nextCheckAtIso: toIso(nextCheckAt),
      });
      return {
        ran: false,
        success: true,
        currentSynced: false,
        historySynced: false,
        reason: 'fresh',
      };
    }
  }
  const metricsRan: ProfileAnalyticsSyncMetric[] = [];
  let currentSynced = false;
  let historySynced = false;

  if (trigger === 'invite_sent') {
    const firstCheckAt = startedAt + CONNECTION_INVITE_FIRST_CHECK_DELAY_MS;
    state.acceptanceNextDueAt = state.acceptanceNextDueAt
      ? Math.min(state.acceptanceNextDueAt, firstCheckAt)
      : firstCheckAt;
  }

  state = {
    ...state,
    attemptStartedAt: startedAt,
    attemptExpiresAt: startedAt + PROFILE_ANALYTICS_ATTEMPT_LEASE_MS,
    status: {
      ...state.status,
      status: 'syncing',
      trigger,
      startedAt,
      finishedAt: undefined,
    },
  };
  await setStoredProfileAnalyticsSyncState(state);

  console.info('[profile-analytics] sync evaluation started', {
    trigger,
    linkedInTabCount: availableLinkedInTabs.length,
    linkedInTabIds,
    preferredTabId,
    selectedTabId: linkedInTab?.id,
    networkLastSuccessAt: state.networkLastSuccessAt,
    networkNextDueAt: state.networkNextDueAt,
    searchLastSuccessAt: state.searchLastSuccessAt,
    ssiLastSuccessAt: state.ssiLastSuccessAt,
    networkBudget: getProfileAnalyticsNetworkBudget(state, startedAt),
    networkDirtyAt: state.networkDirtyAt,
  });

  const bootstrap = await runProfileAnalyticsBootstrapTask({
    state,
    snapshot,
    trigger,
    linkedInTabId: linkedInTab?.id,
    startedAt,
  });
  state = bootstrap.state;
  snapshot = bootstrap.snapshot;
  currentSynced = bootstrap.currentSynced;
  metricsRan.push(...bootstrap.metrics);

  const heavySyncLock = await getActiveLinkedInHeavySyncLock(user.uid);
  const exclusiveHistoryMode = heavySyncLock?.owner === 'connections_history_bootstrap';
  if (exclusiveHistoryMode && trigger === 'profile_metadata_changed') {
    // Preserve the edit signal. Metadata will be refreshed by the first alarm
    // after the one-time history bootstrap releases its exclusive lock.
    state.metadataNextRetryAt = state.metadataNextRetryAt
      ? Math.min(state.metadataNextRetryAt, heavySyncLock.expiresAt + 1_000)
      : heavySyncLock.expiresAt + 1_000;
  }

  if (!exclusiveHistoryMode) {
    const metadataTask = await runProfileAnalyticsMetadataTask({
      userId: user.uid,
      state,
      snapshot,
      trigger,
      linkedInTabId: linkedInTab?.id,
      startedAt,
      bootstrapRan: bootstrap.currentSynced,
    });
    state = metadataTask.state;
    snapshot = metadataTask.snapshot;
    currentSynced = currentSynced || metadataTask.currentSynced;
    metricsRan.push(...metadataTask.metrics);

    const networkTask = await runProfileAnalyticsNetworkTask({
      userId: user.uid,
      state,
      snapshot,
      trigger,
      linkedInTabIds,
      startedAt,
    });
    state = networkTask.state;
    snapshot = networkTask.snapshot;
    currentSynced = currentSynced || networkTask.currentSynced;
    metricsRan.push(...networkTask.metrics);

    const acceptanceTask = await runDueAcceptanceTask({
      userId: user.uid,
      state,
      snapshot,
      trigger,
      startedAt,
    });
    state = acceptanceTask.state;
    currentSynced = currentSynced || acceptanceTask.currentSynced;
    metricsRan.push(...acceptanceTask.metrics);

    const searchTask = await runSearchAppearancesTask({
      userId: user.uid,
      state,
      snapshot,
      trigger,
      startedAt,
    });
    state = searchTask.state;
    snapshot = searchTask.snapshot;
    metricsRan.push(...searchTask.metrics);

    const ssiTask = await runSocialSellingIndexTask({
      userId: user.uid,
      state,
      snapshot,
      trigger,
      linkedInTabId: linkedInTab?.id,
      startedAt,
    });
    state = ssiTask.state;
    snapshot = ssiTask.snapshot;
    metricsRan.push(...ssiTask.metrics);
  } else {
    console.info('[profile-analytics] routine metrics deferred for Connections history bootstrap', {
      trigger,
      accountKey: heavySyncLock.accountKey,
      lockExpiresAt: heavySyncLock.expiresAt,
    });
  }

  // History runs in resumable batches. Bootstrap schedules the first batch;
  // alarms continue it without blocking routine dashboard-open refreshes.
  const historyBootstrap = snapshot?.profile?.connectionHistoryBootstrap;
  const historyHasNeverStarted =
    !historyBootstrap || (historyBootstrap.status === 'needs_repair' && !historyBootstrap.sessionId);
  const shouldEvaluateHistory =
    Boolean(snapshot?.profile) &&
    (historyHasNeverStarted ||
      bootstrap.currentSynced ||
      trigger === 'alarm' ||
      trigger === 'manual' ||
      trigger === 'history_resume' ||
      trigger === 'history_repair' ||
      exclusiveHistoryMode);
  if (shouldEvaluateHistory) {
    const historyTask = await runConnectionHistoryTask({
      state,
      snapshot,
      trigger,
      linkedInTabId: linkedInTab?.id,
    });
    state = historyTask.state;
    snapshot = historyTask.snapshot;
    historySynced = historyTask.historySynced;
  }

  const now = Date.now();
  if (!state.networkNextDueAt && !state.networkNextRetryAt) {
    state.networkNextDueAt = now + getProfileAnalyticsScheduledIntervalMs();
  }
  const remainingHeavySyncLock = await getActiveLinkedInHeavySyncLock(user.uid, now);
  // Routine due timestamps intentionally stay unchanged while history owns
  // LinkedIn. Scheduling from them would create a one-second alarm loop.
  const nextScheduledAt = remainingHeavySyncLock
    ? state.historyNextRetryAt || remainingHeavySyncLock.expiresAt
    : getNextProfileAnalyticsAlarmAt(state, now);
  state = finishProfileAnalyticsSyncState(state, trigger, startedAt, Array.from(new Set(metricsRan)), nextScheduledAt);
  await setStoredProfileAnalyticsSyncState(state);
  await scheduleProfileAnalyticsAlarm(nextScheduledAt, 'next_due_check');

  console.info('[profile-analytics] next checks planned', {
    trigger,
    metricsRan: Array.from(new Set(metricsRan)),
    status: state.status.status,
    networkNextDueAt: state.networkNextRetryAt || state.networkNextDueAt,
    networkNextDueAtIso: toIso(state.networkNextRetryAt || state.networkNextDueAt),
    searchNextDueAt:
      state.searchNextRetryAt || (state.searchLastSuccessAt || now) + PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS,
    ssiNextDueAt: state.ssiNextRetryAt || (state.ssiLastSuccessAt || now) + PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS,
    historyNextRetryAt: state.historyNextRetryAt,
    metadataNextRetryAt: state.metadataNextRetryAt,
    nextScheduledAt,
    nextScheduledAtIso: toIso(nextScheduledAt),
  });

  const historyRequestResult = getProfileAnalyticsHistoryRequestResult({
    trigger,
    hasLinkedInTab: typeof linkedInTab?.id === 'number',
    historyStatus: snapshot?.profile?.connectionHistoryBootstrap?.status,
    historyLastError: state.historyLastError,
  });
  if (historyRequestResult) {
    return {
      ...historyRequestResult,
      currentSynced,
      historySynced,
    };
  }

  const failures = Object.values(state.status.metrics).filter(
    (metric) => metric?.status === 'failed' || metric?.status === 'blocked'
  );
  const noLinkedInTab = failures.some((metric) => metric?.errorCode === 'no_linkedin_tab');
  return {
    ran: metricsRan.length > 0 || historySynced,
    success: failures.length === 0 || currentSynced,
    currentSynced,
    historySynced,
    reason: noLinkedInTab ? 'no_linkedin_tab' : metricsRan.length > 0 || historySynced ? 'synced' : 'fresh',
  };
}

/** Deduplicates only Profile Analytics work; other extension domains remain independent. */
export function queueProfileAnalyticsSync(
  trigger: ProfileAnalyticsSyncTrigger,
  preferredTabId?: number
): Promise<ProfileAnalyticsSyncResult> {
  const request: ProfileAnalyticsSyncRequest = { trigger, preferredTabId };
  if (activeSync && activeSyncRequest) {
    pendingSyncRequest = selectPendingProfileAnalyticsRequest(activeSyncRequest, pendingSyncRequest, request);
    return activeSync;
  }

  activeSyncRequest = request;
  activeSync = runProfileAnalyticsSync(trigger, preferredTabId).finally(() => {
    activeSync = null;
    activeSyncRequest = null;
    const followUpRequest = pendingSyncRequest;
    pendingSyncRequest = null;
    if (followUpRequest) {
      void queueProfileAnalyticsSync(followUpRequest.trigger, followUpRequest.preferredTabId);
    }
  });
  return activeSync;
}

export function queueProfileAnalyticsForLinkedInActivity(tabId?: number): Promise<ProfileAnalyticsSyncResult> {
  const firstActivityForLinkedInSession = typeof tabId === 'number' && observedLinkedInTabIds.size === 0;
  if (typeof tabId === 'number') observedLinkedInTabIds.add(tabId);
  return queueProfileAnalyticsSync(firstActivityForLinkedInSession ? 'linkedin_open' : 'linkedin_activity', tabId);
}

export function forgetProfileAnalyticsLinkedInTab(tabId: number): void {
  observedLinkedInTabIds.delete(tabId);
}
