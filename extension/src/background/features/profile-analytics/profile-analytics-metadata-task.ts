import type { ProfileAnalyticsSnapshot, ProfileAnalyticsSyncMetric } from 'shared/types';
import { syncProfileMetadata } from './profile-analytics-metadata-sync';
import {
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

const METADATA_METRIC: ProfileAnalyticsSyncMetric = 'profileMetadata';

export async function runProfileAnalyticsMetadataTask({
  userId,
  state: initialState,
  snapshot: initialSnapshot,
  trigger,
  linkedInTabId,
  startedAt,
  bootstrapRan,
}: {
  userId: string;
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: ProfileAnalyticsSyncTrigger;
  linkedInTabId?: number;
  startedAt: number;
  bootstrapRan: boolean;
}): Promise<{
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  currentSynced: boolean;
  metrics: ProfileAnalyticsSyncMetric[];
}> {
  if (bootstrapRan || !initialSnapshot?.profile) {
    return { state: initialState, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
  }

  const retryDue =
    typeof initialState.metadataNextRetryAt === 'number' && startedAt >= initialState.metadataNextRetryAt;
  const linkedInOpenCanRetry =
    trigger === 'linkedin_open' &&
    initialState.metadataRetryKind === 'standard' &&
    typeof initialState.metadataNextRetryAt === 'number';
  const requested = trigger === 'profile_metadata_changed' || (trigger === 'alarm' && retryDue) || linkedInOpenCanRetry;
  if (!requested) {
    return { state: initialState, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
  }
  if (
    trigger === 'profile_metadata_changed' &&
    initialState.metadataRetryKind === 'restriction' &&
    initialState.metadataNextRetryAt &&
    startedAt < initialState.metadataNextRetryAt
  ) {
    return { state: initialState, snapshot: initialSnapshot, currentSynced: false, metrics: [] };
  }

  let state = markProfileAnalyticsMetricsRunning(initialState, [METADATA_METRIC], startedAt);
  state.metadataLastAttemptAt = startedAt;
  await setStoredProfileAnalyticsSyncState(state);

  try {
    if (typeof linkedInTabId !== 'number') throw new Error('No LinkedIn tab is open.');
    const result = await syncProfileMetadata({
      userId,
      linkedInTabId,
      currentSnapshot: initialSnapshot,
      collectedAt: startedAt,
    });
    const completedAt = Date.now();
    state = updateMetricStatus(state, METADATA_METRIC, {
      status: 'success',
      lastAttemptAt: startedAt,
      lastSuccessAt: completedAt,
      sourceUrl: result.sourceUrls[result.sourceUrls.length - 1],
    });
    state = {
      ...state,
      metadataLastSuccessAt: completedAt,
      metadataNextRetryAt: undefined,
      metadataRetryKind: undefined,
    };
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot: result.snapshot, currentSynced: true, metrics: [METADATA_METRIC] };
  } catch (error) {
    const failure = classifyProfileAnalyticsFailure(error);
    const retryAt =
      Date.now() +
      (failure.retryKind === 'restriction' ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS);
    state = updateMetricStatus(state, METADATA_METRIC, createProfileAnalyticsFailureStatus(error, retryAt));
    state = {
      ...state,
      metadataNextRetryAt: retryAt,
      metadataRetryKind: failure.retryKind,
    };
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot: initialSnapshot, currentSynced: false, metrics: [METADATA_METRIC] };
  }
}
