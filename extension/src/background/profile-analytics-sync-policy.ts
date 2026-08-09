export const PROFILE_ANALYTICS_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const PROFILE_ANALYTICS_RETRY_DELAY_MS = 15 * 60 * 1000;
export const PROFILE_ANALYTICS_RESTRICTION_RETRY_MS = 12 * 60 * 60 * 1000;
export const PROFILE_ANALYTICS_HISTORY_START_DELAY_MS = 2 * 60 * 1000;
export const PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS = 60 * 60 * 1000;
export const SEARCH_APPEARANCES_SYNC_TTL_MS = PROFILE_ANALYTICS_SYNC_INTERVAL_MS;
export const SOCIAL_SELLING_INDEX_SYNC_TTL_MS = PROFILE_ANALYTICS_SYNC_INTERVAL_MS;

export type ProfileAnalyticsSyncTrigger =
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'service_worker'
  | 'sign_in'
  | 'linkedin_open'
  | 'linkedin_activity'
  | 'alarm';

export type ProfileAnalyticsRetryKind = 'standard' | 'restriction';

export interface ProfileAnalyticsSyncRequest {
  trigger: ProfileAnalyticsSyncTrigger;
  preferredTabId?: number;
}

export interface ProfileAnalyticsSyncState {
  userId: string;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  nextRetryAt?: number;
  ssiLastAttemptAt?: number;
  ssiLastSuccessAt?: number;
  ssiNextRetryAt?: number;
  ssiLastError?: string;
  ssiRetryKind?: ProfileAnalyticsRetryKind;
  historyLastAttemptAt?: number;
  historyCompletedAt?: number;
  historyNextRetryAt?: number;
  lastError?: string;
  retryKind?: ProfileAnalyticsRetryKind;
  historyLastError?: string;
}

export function mustVerifyCurrentProfileAnalytics(trigger: ProfileAnalyticsSyncTrigger): boolean {
  return trigger === 'install' || trigger === 'update' || trigger === 'sign_in' || trigger === 'linkedin_open';
}

export function isCurrentProfileAnalyticsRetryBlocked({
  now,
  state,
  trigger,
}: {
  now: number;
  state?: ProfileAnalyticsSyncState;
  trigger: ProfileAnalyticsSyncTrigger;
}): boolean {
  if (typeof state?.nextRetryAt !== 'number' || now >= state.nextRetryAt) return false;

  // A real LinkedIn restriction must be respected. Ordinary transient failures
  // must not make reload/update/sign-in unable to repair stale Firestore data.
  return state.retryKind === 'restriction' || !mustVerifyCurrentProfileAnalytics(trigger);
}

function triggerPriority(trigger: ProfileAnalyticsSyncTrigger): number {
  if (mustVerifyCurrentProfileAnalytics(trigger)) return 3;
  if (trigger === 'chrome_startup' || trigger === 'service_worker') return 2;
  return 1;
}

/** Keeps one strongest follow-up request while a per-domain sync is running. */
export function selectPendingProfileAnalyticsRequest(
  active: ProfileAnalyticsSyncRequest,
  pending: ProfileAnalyticsSyncRequest | null,
  incoming: ProfileAnalyticsSyncRequest
): ProfileAnalyticsSyncRequest | null {
  const incomingIsForced = mustVerifyCurrentProfileAnalytics(incoming.trigger);
  const activeIsEquivalentForcedRequest =
    incomingIsForced &&
    incoming.trigger === active.trigger &&
    incoming.preferredTabId === active.preferredTabId;
  if (!incomingIsForced || activeIsEquivalentForcedRequest) return pending;
  if (!pending || triggerPriority(incoming.trigger) >= triggerPriority(pending.trigger)) return incoming;
  return pending;
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

export function isSocialSellingIndexRetryBlocked({
  now,
  state,
  trigger,
}: {
  now: number;
  state?: ProfileAnalyticsSyncState;
  trigger: ProfileAnalyticsSyncTrigger;
}): boolean {
  if (typeof state?.ssiNextRetryAt !== 'number' || now >= state.ssiNextRetryAt) return false;
  return state.ssiRetryKind === 'restriction' || !mustVerifyCurrentProfileAnalytics(trigger);
}

export function isSocialSellingIndexDue({
  now,
  state,
}: {
  now: number;
  state?: ProfileAnalyticsSyncState;
}): boolean {
  if (!state?.ssiLastSuccessAt) return true;
  return now - state.ssiLastSuccessAt >= SOCIAL_SELLING_INDEX_SYNC_TTL_MS;
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
