import type { ProfileAnalyticsSnapshot, ProfileAnalyticsSyncMetric } from 'shared/types';
import { syncSearchAppearancesMetric } from './profile-analytics-search-appearances-sync';
import { syncSocialSellingIndexMetric } from './profile-analytics-ssi-sync';
import {
  isSearchAppearancesDue,
  isSearchAppearancesRetryBlocked,
  isSocialSellingIndexDue,
  isSocialSellingIndexRetryBlocked,
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

export interface DailyAnalyticsTaskResult {
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  metrics: ProfileAnalyticsSyncMetric[];
}

function getRetry(failure: ReturnType<typeof classifyProfileAnalyticsFailure>): number {
  return (
    Date.now() +
    (failure.retryKind === 'restriction' ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS)
  );
}

export async function runSearchAppearancesTask({
  userId,
  state: initialState,
  snapshot: initialSnapshot,
  trigger,
  startedAt,
}: {
  userId: string;
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: ProfileAnalyticsSyncTrigger;
  startedAt: number;
}): Promise<DailyAnalyticsTaskResult> {
  const shouldRun =
    !isSearchAppearancesRetryBlocked({ now: startedAt, state: initialState, trigger }) &&
    (isSearchAppearancesDue({ now: startedAt, state: initialState }) || trigger === 'manual');
  if (!shouldRun) return { state: initialState, snapshot: initialSnapshot, metrics: [] };

  let state = markProfileAnalyticsMetricsRunning(initialState, ['searchAppearances'], startedAt);
  state.searchLastAttemptAt = startedAt;
  await setStoredProfileAnalyticsSyncState(state);
  const result = await syncSearchAppearancesMetric({
    userId,
    currentSnapshot: initialSnapshot,
    collectedAt: startedAt,
  });
  if (result.collected) {
    const completedAt = Date.now();
    state = updateMetricStatus(state, 'searchAppearances', {
      status: 'success',
      lastAttemptAt: startedAt,
      lastSuccessAt: completedAt,
      sourceUrl: result.sourceUrl,
    });
    state.searchLastSuccessAt = completedAt;
    state.searchNextRetryAt = undefined;
    state.searchRetryKind = undefined;
  } else {
    const failure = classifyProfileAnalyticsFailure(result.error);
    const retryAt = getRetry(failure);
    state = updateMetricStatus(state, 'searchAppearances', createProfileAnalyticsFailureStatus(result.error, retryAt));
    state.searchNextRetryAt = retryAt;
    state.searchRetryKind = failure.retryKind;
  }
  await setStoredProfileAnalyticsSyncState(state);
  return { state, snapshot: result.snapshot, metrics: ['searchAppearances'] };
}

export async function runSocialSellingIndexTask({
  userId,
  state: initialState,
  snapshot: initialSnapshot,
  trigger,
  linkedInTabId,
  startedAt,
}: {
  userId: string;
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: ProfileAnalyticsSyncTrigger;
  linkedInTabId?: number;
  startedAt: number;
}): Promise<DailyAnalyticsTaskResult> {
  const shouldRun =
    !isSocialSellingIndexRetryBlocked({ now: startedAt, state: initialState, trigger }) &&
    (isSocialSellingIndexDue({ now: startedAt, state: initialState }) || trigger === 'manual');
  if (!shouldRun) return { state: initialState, snapshot: initialSnapshot, metrics: [] };

  let state = markProfileAnalyticsMetricsRunning(initialState, ['socialSellingIndex'], startedAt);
  state.ssiLastAttemptAt = startedAt;
  await setStoredProfileAnalyticsSyncState(state);
  const result = await syncSocialSellingIndexMetric({
    userId,
    trigger,
    linkedInTabId,
    currentSnapshot: initialSnapshot,
    collectedAt: startedAt,
  });
  if (result.collected) {
    const completedAt = Date.now();
    state = updateMetricStatus(state, 'socialSellingIndex', {
      status: 'success',
      lastAttemptAt: startedAt,
      lastSuccessAt: completedAt,
      sourceUrl: result.snapshot?.socialSellingIndex?.sourceUrl,
    });
    state.ssiLastSuccessAt = completedAt;
    state.ssiNextRetryAt = undefined;
    state.ssiRetryKind = undefined;
  } else {
    const failure = classifyProfileAnalyticsFailure(result.error);
    const retryAt = getRetry(failure);
    state = updateMetricStatus(state, 'socialSellingIndex', createProfileAnalyticsFailureStatus(result.error, retryAt));
    state.ssiNextRetryAt = retryAt;
    state.ssiRetryKind = failure.retryKind;
  }
  await setStoredProfileAnalyticsSyncState(state);
  return { state, snapshot: result.snapshot, metrics: ['socialSellingIndex'] };
}
