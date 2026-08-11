import type { ProfileAnalyticsSnapshot } from 'shared/types';
import { syncConnectionHistoryBatch } from './profile-analytics-history-sync';
import {
  isConnectionHistoryDue,
  PROFILE_ANALYTICS_HISTORY_BATCH_DELAY_MS,
  PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS,
  PROFILE_ANALYTICS_HISTORY_START_DELAY_MS,
  type ProfileAnalyticsSyncState,
  type ProfileAnalyticsSyncTrigger,
} from './profile-analytics-sync-policy';
import { setStoredProfileAnalyticsSyncState } from './profile-analytics-sync-runtime';

export async function runConnectionHistoryTask({
  state: initialState,
  snapshot: initialSnapshot,
  trigger,
  linkedInTabId,
}: {
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: ProfileAnalyticsSyncTrigger;
  linkedInTabId?: number;
}): Promise<{
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  historySynced: boolean;
}> {
  if (
    !initialSnapshot?.profile ||
    !isConnectionHistoryDue({
      now: Date.now(),
      historyComplete: initialSnapshot.profile.connectionDateCountsComplete === true,
      state: initialState,
    })
  ) {
    return { state: initialState, snapshot: initialSnapshot, historySynced: false };
  }

  const state = { ...initialState };
  let snapshot = initialSnapshot;
  let historySynced = false;
  if (!state.historyLastAttemptAt && trigger !== 'alarm') {
    state.historyNextRetryAt = Date.now() + PROFILE_ANALYTICS_HISTORY_START_DELAY_MS;
  } else if (typeof linkedInTabId === 'number') {
    state.historyLastAttemptAt = Date.now();
    state.historyNextRetryAt = undefined;
    state.historyAttemptInProgress = true;
    if (state.historyCheckpoint) {
      state.historyCheckpoint = { ...state.historyCheckpoint, status: 'running' };
    }
    await setStoredProfileAnalyticsSyncState(state);
    try {
      console.info('[profile-analytics] connection history batch started', {
        linkedInTabId,
        nextStartIndex: state.historyCheckpoint?.nextStartIndex || 0,
        collectedUniqueCount: state.historyCheckpoint?.collectedUniqueCount || 0,
      });
      const batch = await syncConnectionHistoryBatch({
        userId: state.userId,
        linkedInTabId,
        currentSnapshot: snapshot,
        checkpoint: state.historyCheckpoint,
      });
      snapshot = batch.snapshot;
      historySynced = batch.complete;
      state.historyCompletedAt = historySynced ? Date.now() : undefined;
      state.historyAttemptInProgress = false;
      state.historyCheckpoint = batch.checkpoint;
      state.historyNextRetryAt = historySynced
        ? undefined
        : Date.now() +
          (batch.error ? PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS : PROFILE_ANALYTICS_HISTORY_BATCH_DELAY_MS);
      state.historyLastError = historySynced ? undefined : snapshot.profile?.connectionDateCountsError;
      console.info('[profile-analytics] connection history batch finished', {
        historySynced,
        nextStartIndex: state.historyCheckpoint?.nextStartIndex,
        collectedUniqueCount: state.historyCheckpoint?.collectedUniqueCount,
        error: state.historyLastError,
      });
    } catch (error) {
      state.historyNextRetryAt = Date.now() + PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS;
      state.historyAttemptInProgress = false;
      state.historyLastError = error instanceof Error ? error.message : String(error);
      if (state.historyCheckpoint) {
        state.historyCheckpoint = {
          ...state.historyCheckpoint,
          status: 'failed',
          error: state.historyLastError,
          lastAttemptAt: Date.now(),
        };
      }
    }
  } else {
    state.historyNextRetryAt = Date.now() + PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS;
    state.historyLastError = 'No LinkedIn tab is open for the next connection-history batch.';
  }
  await setStoredProfileAnalyticsSyncState(state);
  return { state, snapshot, historySynced };
}
