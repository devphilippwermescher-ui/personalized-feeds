export const PROFILE_ANALYTICS_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const PROFILE_ANALYTICS_RETRY_DELAY_MS = 15 * 60 * 1000;
export const PROFILE_ANALYTICS_RESTRICTION_RETRY_MS = 12 * 60 * 60 * 1000;
export const PROFILE_ANALYTICS_HISTORY_START_DELAY_MS = 2 * 60 * 1000;
export const PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS = 60 * 60 * 1000;
export const SEARCH_APPEARANCES_SYNC_TTL_MS = PROFILE_ANALYTICS_SYNC_INTERVAL_MS;

export interface ProfileAnalyticsSyncState {
  userId: string;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  nextRetryAt?: number;
  historyLastAttemptAt?: number;
  historyCompletedAt?: number;
  historyNextRetryAt?: number;
  lastError?: string;
  historyLastError?: string;
}

export function isCurrentProfileAnalyticsDue({
  now,
  state,
}: {
  now: number;
  state?: ProfileAnalyticsSyncState;
}): boolean {
  // A newly installed sync-policy version must verify the current values once,
  // even when an older extension recently touched the Firestore snapshot.
  if (!state) return true;
  if (state?.nextRetryAt && now < state.nextRetryAt) return false;
  return !state.lastSuccessAt || now - state.lastSuccessAt >= PROFILE_ANALYTICS_SYNC_INTERVAL_MS;
}

export function isConnectionHistoryDue({
  now,
  historyComplete,
  state,
}: {
  now: number;
  historyComplete: boolean;
  state?: ProfileAnalyticsSyncState;
}): boolean {
  if (historyComplete) return false;
  return !state?.historyNextRetryAt || now >= state.historyNextRetryAt;
}
