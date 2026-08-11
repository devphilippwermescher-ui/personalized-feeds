import type { ProfileAnalyticsSnapshot } from 'shared/types';
import { syncConnectionHistoryFromLinkedIn } from './profile-analytics-sync';
import {
  isConnectionHistoryDue,
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
    try {
      console.info('[profile-analytics] first-bootstrap connection history started', { linkedInTabId });
      snapshot = await syncConnectionHistoryFromLinkedIn(linkedInTabId);
      historySynced = snapshot.profile?.connectionDateCountsComplete === true;
      state.historyCompletedAt = historySynced ? Date.now() : undefined;
      state.historyNextRetryAt = historySynced ? undefined : Date.now() + PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS;
      state.historyLastError = historySynced ? undefined : snapshot.profile?.connectionDateCountsError;
      console.info('[profile-analytics] first-bootstrap connection history finished', {
        historySynced,
        error: state.historyLastError,
      });
    } catch (error) {
      state.historyNextRetryAt = Date.now() + PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS;
      state.historyLastError = error instanceof Error ? error.message : String(error);
    }
  }
  await setStoredProfileAnalyticsSyncState(state);
  return { state, snapshot, historySynced };
}
