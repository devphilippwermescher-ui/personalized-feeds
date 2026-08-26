import type { ProfileAnalyticsSnapshot, ProfileAnalyticsSyncMetric } from 'shared/types';
import { syncProfileAnalyticsFromLinkedInTabs } from './profile-analytics-sync';
import {
  getProfileAnalyticsScheduledIntervalMs,
  PROFILE_ANALYTICS_RESTRICTION_RETRY_MS,
  PROFILE_ANALYTICS_RETRY_DELAY_MS,
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

export interface ProfileAnalyticsBootstrapTaskResult {
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  currentSynced: boolean;
  metrics: ProfileAnalyticsSyncMetric[];
}

/** Runs metadata collection only when no persisted profile bootstrap exists. */
export async function runProfileAnalyticsBootstrapTask({
  state: initialState,
  snapshot: initialSnapshot,
  trigger,
  linkedInTabId,
  startedAt,
}: {
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: ProfileAnalyticsSyncTrigger;
  linkedInTabId?: number;
  startedAt: number;
}): Promise<ProfileAnalyticsBootstrapTaskResult> {
  if (initialSnapshot?.profile) {
    return { state: initialState, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
  }

  const blocked =
    initialState.bootstrapNextRetryAt && startedAt < initialState.bootstrapNextRetryAt && trigger !== 'manual';
  if (blocked) {
    return { state: initialState, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
  }

  const metrics: ProfileAnalyticsSyncMetric[] = ['profileMetadata', 'connections', 'followers', 'searchAppearances'];
  let state = markProfileAnalyticsMetricsRunning(initialState, metrics, startedAt);
  let snapshot = initialSnapshot;
  state.bootstrapLastAttemptAt = startedAt;
  await setStoredProfileAnalyticsSyncState(state);

  try {
    if (typeof linkedInTabId !== 'number') throw new Error('No LinkedIn tab is open.');
    const result = await syncProfileAnalyticsFromLinkedInTabs({
      preferredTabId: linkedInTabId,
      currentSnapshot: snapshot,
      forceCurrentMetrics: true,
    });
    snapshot = result.snapshot;
    const completedAt = Date.now();
    state = updateMetricStatus(state, 'connections', {
      status: 'success',
      lastAttemptAt: startedAt,
      lastSuccessAt: completedAt,
    });
    state = updateMetricStatus(state, 'profileMetadata', {
      status: 'success',
      lastAttemptAt: startedAt,
      lastSuccessAt: completedAt,
      sourceUrl: snapshot.profile?.sourceUrl,
    });
    state = updateMetricStatus(state, 'followers', {
      status: 'success',
      lastAttemptAt: startedAt,
      lastSuccessAt: completedAt,
    });
    if (result.collected.searchAppearances) {
      state = updateMetricStatus(state, 'searchAppearances', {
        status: 'success',
        lastAttemptAt: startedAt,
        lastSuccessAt: completedAt,
        sourceUrl: snapshot.searchAppearances?.sourceUrl,
      });
      state.searchLastSuccessAt = completedAt;
    }
    state = {
      ...state,
      bootstrapCompletedAt: completedAt,
      metadataLastSuccessAt: completedAt,
      bootstrapNextRetryAt: undefined,
      bootstrapRetryKind: undefined,
      networkLastAttemptAt: startedAt,
      networkLastSuccessAt: completedAt,
      networkNextDueAt: completedAt + getProfileAnalyticsScheduledIntervalMs(),
      networkNextRetryAt: undefined,
      networkRetryKind: undefined,
    };
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot, currentSynced: true, metrics };
  } catch (error) {
    const failure = classifyProfileAnalyticsFailure(error);
    const retryAt =
      Date.now() +
      (failure.retryKind === 'restriction' ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS);
    metrics.forEach((metric) => {
      state = updateMetricStatus(state, metric, createProfileAnalyticsFailureStatus(error, retryAt));
    });
    state = {
      ...state,
      bootstrapNextRetryAt: retryAt,
      bootstrapRetryKind: failure.retryKind,
      networkNextRetryAt: retryAt,
      networkRetryKind: failure.retryKind,
    };
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot, currentSynced: false, metrics };
  }
}
