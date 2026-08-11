import { CONNECTION_INVITE_FIRST_CHECK_DELAY_MS, getProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsSyncMetric } from 'shared/types';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { runDueAcceptanceTask } from './profile-analytics-acceptance-task';
import { runProfileAnalyticsBootstrapTask } from './profile-analytics-bootstrap-task';
import { runSearchAppearancesTask, runSocialSellingIndexTask } from './profile-analytics-daily-sync-tasks';
import { runConnectionHistoryTask } from './profile-analytics-history-task';
import { runProfileAnalyticsNetworkTask } from './profile-analytics-network-task';
import { selectLinkedInExecutionTabs } from './linkedin-tab-selection';
import {
  createProfileAnalyticsSyncState,
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
  let snapshot = await getProfileAnalyticsSnapshot(user.uid);
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

  // Connection-history pagination is intentionally a first-bootstrap-only
  // operation. It must never block routine hourly or dashboard-open refreshes.
  if (bootstrap.currentSynced && bootstrap.metrics.length > 0) {
    const historyTask = await runConnectionHistoryTask({
      state,
      snapshot,
      trigger: 'alarm',
      linkedInTabId: linkedInTab?.id,
    });
    state = historyTask.state;
    snapshot = historyTask.snapshot;
    historySynced = historyTask.historySynced;
  } else if (state.historyNextRetryAt) {
    state = { ...state, historyNextRetryAt: undefined };
  }

  const now = Date.now();
  if (!state.networkNextDueAt && !state.networkNextRetryAt) {
    state.networkNextDueAt = now + getProfileAnalyticsScheduledIntervalMs();
  }
  const nextScheduledAt = getNextProfileAnalyticsAlarmAt(state, now);
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
    nextScheduledAt,
    nextScheduledAtIso: toIso(nextScheduledAt),
  });

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
