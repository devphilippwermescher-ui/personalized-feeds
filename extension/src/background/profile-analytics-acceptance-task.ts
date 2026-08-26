import type { ProfileAnalyticsSnapshot, ProfileAnalyticsSyncMetric } from 'shared/types';
import { syncTrackedConnectionInviteAcceptance } from './connection-invites-sync';
import {
  PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS,
  PROFILE_ANALYTICS_RESTRICTION_RETRY_MS,
  PROFILE_ANALYTICS_RETRY_DELAY_MS,
  markProfileAnalyticsNetworkDirty,
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
import { withPromiseTimeout } from './promise-timeout';

const ACCEPTANCE_TASK_TIMEOUT_MS = 45_000;

export async function runDueAcceptanceTask({
  userId,
  state: initialState,
  snapshot,
  trigger,
  startedAt,
}: {
  userId: string;
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: ProfileAnalyticsSyncTrigger;
  startedAt: number;
}): Promise<{
  state: ProfileAnalyticsSyncState;
  currentSynced: boolean;
  metrics: ProfileAnalyticsSyncMetric[];
}> {
  const due = Boolean(initialState.acceptanceNextDueAt && startedAt >= initialState.acceptanceNextDueAt);
  if (!snapshot?.profile || !due) {
    return { state: initialState, currentSynced: false, metrics: [] };
  }

  let state = markProfileAnalyticsMetricsRunning(initialState, ['acceptanceRate'], startedAt);
  await setStoredProfileAnalyticsSyncState(state);
  try {
    console.info('[profile-analytics] due acceptance reconciliation started', { trigger });
    const result = await withPromiseTimeout(
      syncTrackedConnectionInviteAcceptance(userId, startedAt),
      ACCEPTANCE_TASK_TIMEOUT_MS,
      'LinkedIn invitation acceptance sync'
    );
    const completedAt = Date.now();
    state = updateMetricStatus(state, 'acceptanceRate', {
      status: 'success',
      lastAttemptAt: startedAt,
      lastSuccessAt: completedAt,
    });
    state.acceptanceNextDueAt = result.nextDueAt || completedAt + PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS;
    if ((result.acceptedCount || 0) > 0) {
      state = markProfileAnalyticsNetworkDirty(state, completedAt);
    }
    console.info('[profile-analytics] due acceptance reconciliation completed', {
      trigger,
      checkedCount: result.checkedCount,
      acceptedCount: result.acceptedCount,
      nextDueAt: result.nextDueAt,
    });
    await setStoredProfileAnalyticsSyncState(state);
    return { state, currentSynced: true, metrics: ['acceptanceRate'] };
  } catch (error) {
    const failure = classifyProfileAnalyticsFailure(error);
    const retryAt =
      Date.now() +
      (failure.retryKind === 'restriction' ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS);
    state = updateMetricStatus(state, 'acceptanceRate', createProfileAnalyticsFailureStatus(error, retryAt));
    state.acceptanceNextDueAt = retryAt;
    await setStoredProfileAnalyticsSyncState(state);
    return { state, currentSynced: false, metrics: ['acceptanceRate'] };
  }
}
