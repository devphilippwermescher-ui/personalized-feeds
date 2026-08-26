import type { ProfileAnalyticsSnapshot, ProfileAnalyticsSyncMetric } from 'shared/types';
import { syncProfileNetworkMetrics } from './profile-analytics-network-sync';
import {
  canRunProfileAnalyticsNetworkSync,
  getProfileAnalyticsNetworkBudget,
  getProfileAnalyticsScheduledIntervalMs,
  isCurrentProfileAnalyticsDue,
  isCurrentProfileAnalyticsRetryBlocked,
  isDashboardNetworkSyncDue,
  PROFILE_ANALYTICS_RESTRICTION_RETRY_MS,
  PROFILE_ANALYTICS_RETRY_DELAY_MS,
  PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS,
  PROFILE_ANALYTICS_HISTORY_BATCH_DELAY_MS,
  recordProfileAnalyticsNetworkSync,
  updateMetricStatus,
  type ProfileAnalyticsSyncState,
  type ProfileAnalyticsSyncTrigger,
} from './profile-analytics-sync-policy';
import {
  classifyProfileAnalyticsFailure,
  createProfileAnalyticsFailureStatus,
  markProfileAnalyticsMetricsRunning,
  setStoredProfileAnalyticsSyncState,
} from './profile-analytics-sync-runtime';

const NETWORK_METRICS: ProfileAnalyticsSyncMetric[] = ['connections', 'followers'];

export async function runProfileAnalyticsNetworkTask({
  userId,
  state: initialState,
  snapshot: initialSnapshot,
  trigger,
  linkedInTabIds,
  startedAt,
}: {
  userId: string;
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: ProfileAnalyticsSyncTrigger;
  linkedInTabIds: number[];
  startedAt: number;
}): Promise<{
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  currentSynced: boolean;
  metrics: ProfileAnalyticsSyncMetric[];
}> {
  if (!initialSnapshot?.profile) {
    return { state: initialState, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
  }

  const dashboardForcesNetwork = trigger === 'dashboard_open' && isDashboardNetworkSyncDue(startedAt, initialState);
  const needsExactConnectionsMigration = initialSnapshot.profile.connectionsCountExact !== true;
  const requested =
    needsExactConnectionsMigration ||
    dashboardForcesNetwork ||
    isCurrentProfileAnalyticsDue({ now: startedAt, state: initialState }) ||
    trigger === 'manual';
  if (!requested) {
    return { state: initialState, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
  }

  let state = initialState;
  const budget = getProfileAnalyticsNetworkBudget(state, startedAt);
  const budgetAvailable = canRunProfileAnalyticsNetworkSync(state, startedAt, trigger);
  if (!budgetAvailable) {
    // Dashboard refreshes keep three tokens in reserve for scheduled work. A
    // foreground skip must not block the alarm that owns those reserve tokens.
    if (budget.tokensAvailable >= 1) {
      console.info('[profile-analytics] dashboard network sync skipped to preserve background budget', {
        trigger,
        tokensAvailable: budget.tokensAvailable,
      });
      return { state, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
    }

    const budgetResetAt = budget.nextTokenAt || startedAt + PROFILE_ANALYTICS_RETRY_DELAY_MS;
    NETWORK_METRICS.forEach((metric) => {
      state = updateMetricStatus(state, metric, {
        status: 'blocked',
        lastAttemptAt: startedAt,
        nextRetryAt: budgetResetAt,
        errorCode: 'request_budget_reached',
        message: 'The next Connections and Followers refresh slot is still recovering.',
        technicalMessage: 'The Profile Analytics token bucket has no network cycle available yet.',
      });
    });
    state.networkNextRetryAt = budgetResetAt;
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
  }

  if (isCurrentProfileAnalyticsRetryBlocked({ now: startedAt, state, trigger })) {
    return { state, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
  }

  state = markProfileAnalyticsMetricsRunning(state, NETWORK_METRICS, startedAt);
  state.networkLastAttemptAt = startedAt;
  await setStoredProfileAnalyticsSyncState(state);
  let snapshot = initialSnapshot;

  try {
    if (linkedInTabIds.length === 0) throw new Error('No LinkedIn tab is open.');
    // Consume only when a LinkedIn tab exists and the actual collection task
    // is about to start. Merely waking the worker never spends the budget.
    state = recordProfileAnalyticsNetworkSync(state, Date.now());
    await setStoredProfileAnalyticsSyncState(state);
    console.info('[profile-analytics] light network sync started', { trigger, linkedInTabIds });
    const result = await syncProfileNetworkMetrics({
      userId,
      linkedInTabIds,
      currentSnapshot: snapshot,
      connectionCatchUpCheckpoint: state.connectionCatchUpCheckpoint,
      collectedAt: startedAt,
    });
    snapshot = result.snapshot;
    const completedAt = Date.now();
    const applyResult = (metric: 'connections' | 'followers', metricResult: typeof result.connections) => {
      if (metricResult.collected) {
        state = updateMetricStatus(state, metric, {
          status: 'success',
          lastAttemptAt: startedAt,
          lastSuccessAt: completedAt,
          sourceUrl: metricResult.sourceUrl,
        });
      } else {
        const failure = classifyProfileAnalyticsFailure(metricResult.error || `${metric} was not collected.`);
        const retryAt =
          completedAt +
          (failure.retryKind === 'restriction'
            ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS
            : PROFILE_ANALYTICS_RETRY_DELAY_MS);
        state = updateMetricStatus(state, metric, createProfileAnalyticsFailureStatus(metricResult.error, retryAt));
      }
    };
    applyResult('connections', result.connections);
    applyResult('followers', result.followers);
    const totalsSucceeded = result.connections.collected && result.followers.collected;
    const restricted = NETWORK_METRICS.map((metric) => state.status.metrics[metric]).some(
      (metric) => metric?.status === 'blocked'
    );
    state = {
      ...state,
      networkLastSuccessAt: totalsSucceeded ? completedAt : state.networkLastSuccessAt,
      networkNextDueAt: totalsSucceeded
        ? completedAt +
          (result.connectionCatchUpCheckpoint
            ? PROFILE_ANALYTICS_HISTORY_BATCH_DELAY_MS
            : getProfileAnalyticsScheduledIntervalMs())
        : state.networkNextDueAt,
      networkNextRetryAt: totalsSucceeded
        ? undefined
        : completedAt + (restricted ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS),
      networkRetryKind: totalsSucceeded ? undefined : restricted ? 'restriction' : 'standard',
      networkDirtyAt: totalsSucceeded ? undefined : state.networkDirtyAt,
      acceptanceNextDueAt: state.acceptanceNextDueAt || completedAt + PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS,
      connectionCatchUpCheckpoint: result.connectionCatchUpCheckpoint,
    };
    console.info('[profile-analytics] light network sync finished', {
      trigger,
      connectionsCollected: result.connections.collected,
      connectionsCount: result.connections.value,
      connectionsChanged: result.connections.changed,
      incrementalCatchUpNeeded: result.connections.repairNeeded,
      followersCollected: result.followers.collected,
      followersCount: result.followers.value,
      followersChanged: result.followers.changed,
    });
    await setStoredProfileAnalyticsSyncState(state);
    return {
      state,
      snapshot,
      currentSynced: result.connections.collected || result.followers.collected,
      metrics: NETWORK_METRICS,
    };
  } catch (error) {
    const failure = classifyProfileAnalyticsFailure(error);
    const retryAt =
      Date.now() +
      (failure.retryKind === 'restriction' ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS);
    NETWORK_METRICS.forEach((metric) => {
      state = updateMetricStatus(state, metric, createProfileAnalyticsFailureStatus(error, retryAt));
    });
    state.networkNextRetryAt = retryAt;
    state.networkRetryKind = failure.retryKind;
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot, currentSynced: false, metrics: NETWORK_METRICS };
  }
}
