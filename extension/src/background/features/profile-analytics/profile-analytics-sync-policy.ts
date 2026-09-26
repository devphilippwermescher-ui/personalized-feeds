import type {
  ProfileAnalyticsSyncMetric,
  ProfileAnalyticsSyncMetricStatus,
  ProfileAnalyticsSyncStatus,
} from 'shared/types';

export const PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS = 60 * 60 * 1000;
export const PROFILE_ANALYTICS_NETWORK_MIN_INTERVAL_MS = 60 * 60 * 1000;
export const PROFILE_ANALYTICS_NETWORK_MAX_INTERVAL_MS = 65 * 60 * 1000;
export const PROFILE_ANALYTICS_DASHBOARD_DEDUPE_MS = 5 * 60 * 1000;
export const PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const PROFILE_ANALYTICS_RETRY_DELAY_MS = 15 * 60 * 1000;
export const PROFILE_ANALYTICS_RESTRICTION_RETRY_MS = 12 * 60 * 60 * 1000;
export const PROFILE_ANALYTICS_HISTORY_BATCH_DELAY_MS = 30 * 1000;
export const PROFILE_ANALYTICS_HISTORY_COOLDOWN_MS = 90 * 1000;
export const PROFILE_ANALYTICS_HISTORY_COOLDOWN_BATCHES = 5;
export const PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS = 60 * 60 * 1000;
export const PROFILE_ANALYTICS_ATTEMPT_LEASE_MS = 2 * 60 * 1000;
export const PROFILE_ANALYTICS_NETWORK_BUDGET_CAPACITY = 30;
export const PROFILE_ANALYTICS_NETWORK_BUDGET_REFILL_MS = 48 * 60 * 1000;
export const PROFILE_ANALYTICS_NETWORK_BACKGROUND_RESERVE = 3;
export const SEARCH_APPEARANCES_SYNC_TTL_MS = PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS;
export const SOCIAL_SELLING_INDEX_SYNC_TTL_MS = PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS;

// Compatibility name for callers that treat the current total collector as
// the primary Profile Analytics cadence.
export const PROFILE_ANALYTICS_SYNC_INTERVAL_MS = PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS;

export type ProfileAnalyticsSyncTrigger =
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'service_worker'
  | 'sign_in'
  | 'linkedin_open'
  | 'linkedin_activity'
  | 'profile_metadata_changed'
  | 'dashboard_open'
  | 'invite_sent'
  | 'alarm'
  | 'manual'
  | 'history_resume'
  | 'history_repair';

export type ProfileAnalyticsRetryKind = 'standard' | 'restriction';

export interface ProfileAnalyticsSyncRequest {
  trigger: ProfileAnalyticsSyncTrigger;
  preferredTabId?: number;
}

export interface ProfileAnalyticsSyncLog {
  startedAt: number;
  finishedAt: number;
  trigger: ProfileAnalyticsSyncTrigger;
  status: ProfileAnalyticsSyncStatus['status'];
  metrics: ProfileAnalyticsSyncMetric[];
  nextScheduledAt?: number;
}

export interface ProfileAnalyticsConnectionHistoryCheckpoint {
  version: 1;
  expectedTotal: number;
  nextStartIndex: number;
  /** Kept in extension-local storage only to make resumed batches idempotent. */
  connectionDatesById: Record<string, string>;
  recentConnectionIds: string[];
  collectedUniqueCount: number;
  lastAttemptAt: number;
  status: 'pending' | 'running' | 'failed';
  error?: string;
}

export interface ProfileAnalyticsConnectionCatchUpCheckpoint {
  version: 1;
  expectedTotal: number;
  nextStartIndex: number;
  /** Only post-bootstrap candidates; unlike the baseline this stays small. */
  connectionDatesById: Record<string, string>;
  /** Frozen boundary from the last completed sync; never replaced mid-catch-up. */
  boundaryConnectionIds: string[];
  recentConnectionIds: string[];
  lastAttemptAt: number;
}

export interface ProfileAnalyticsSyncState {
  version: 1 | 2 | 3;
  userId: string;
  networkLastAttemptAt?: number;
  networkLastSuccessAt?: number;
  networkNextDueAt?: number;
  networkNextRetryAt?: number;
  networkRetryKind?: ProfileAnalyticsRetryKind;
  acceptanceNextDueAt?: number;
  /** @deprecated Fixed-window diagnostics retained only while old local state migrates. */
  requestWindowStartedAt?: number;
  /** @deprecated Fixed-window diagnostics retained only while old local state migrates. */
  networkCyclesInWindow?: number;
  networkBudgetTokens?: number;
  networkBudgetUpdatedAt?: number;
  /** A known LinkedIn relationship change invalidates even a recently collected total. */
  networkDirtyAt?: number;
  searchLastAttemptAt?: number;
  searchLastSuccessAt?: number;
  searchNextRetryAt?: number;
  searchRetryKind?: ProfileAnalyticsRetryKind;
  ssiLastAttemptAt?: number;
  ssiLastSuccessAt?: number;
  ssiNextRetryAt?: number;
  ssiRetryKind?: ProfileAnalyticsRetryKind;
  bootstrapLastAttemptAt?: number;
  bootstrapCompletedAt?: number;
  bootstrapNextRetryAt?: number;
  bootstrapRetryKind?: ProfileAnalyticsRetryKind;
  historyLastAttemptAt?: number;
  historyCompletedAt?: number;
  historyNextRetryAt?: number;
  historyLastError?: string;
  historyCheckpoint?: ProfileAnalyticsConnectionHistoryCheckpoint;
  historyAttemptInProgress?: boolean;
  connectionCatchUpCheckpoint?: ProfileAnalyticsConnectionCatchUpCheckpoint;
  metadataLastAttemptAt?: number;
  metadataLastSuccessAt?: number;
  metadataNextRetryAt?: number;
  metadataRetryKind?: ProfileAnalyticsRetryKind;
  attemptStartedAt?: number;
  attemptExpiresAt?: number;
  nextScheduledAt?: number;
  status: ProfileAnalyticsSyncStatus;
  logs: ProfileAnalyticsSyncLog[];
}

export function createProfileAnalyticsSyncState(userId: string): ProfileAnalyticsSyncState {
  return {
    version: 3,
    userId,
    networkBudgetTokens: PROFILE_ANALYTICS_NETWORK_BUDGET_CAPACITY,
    networkBudgetUpdatedAt: Date.now(),
    status: { status: 'idle', metrics: {} },
    logs: [],
  };
}

export interface ProfileAnalyticsNetworkBudget {
  tokensAvailable: number;
  nextTokenAt?: number;
}

/**
 * Returns a gradually refilling request budget. Legacy fixed-window state gets
 * a full bucket once so an extension upgrade cannot remain blocked for hours.
 */
export function getProfileAnalyticsNetworkBudget(
  state: ProfileAnalyticsSyncState,
  now: number
): ProfileAnalyticsNetworkBudget {
  if (
    typeof state.networkBudgetTokens !== 'number' ||
    !Number.isFinite(state.networkBudgetTokens) ||
    typeof state.networkBudgetUpdatedAt !== 'number' ||
    !Number.isFinite(state.networkBudgetUpdatedAt)
  ) {
    return { tokensAvailable: PROFILE_ANALYTICS_NETWORK_BUDGET_CAPACITY };
  }

  const elapsed = Math.max(0, now - state.networkBudgetUpdatedAt);
  const tokensAvailable = Math.min(
    PROFILE_ANALYTICS_NETWORK_BUDGET_CAPACITY,
    Math.max(0, state.networkBudgetTokens) + elapsed / PROFILE_ANALYTICS_NETWORK_BUDGET_REFILL_MS
  );
  if (tokensAvailable >= PROFILE_ANALYTICS_NETWORK_BUDGET_CAPACITY) return { tokensAvailable };
  const nextWholeToken = Math.floor(tokensAvailable) + 1;
  return {
    tokensAvailable,
    nextTokenAt: now + Math.ceil((nextWholeToken - tokensAvailable) * PROFILE_ANALYTICS_NETWORK_BUDGET_REFILL_MS),
  };
}

export function canRunProfileAnalyticsNetworkSync(
  state: ProfileAnalyticsSyncState,
  now: number,
  trigger: ProfileAnalyticsSyncTrigger = 'alarm'
): boolean {
  const { tokensAvailable } = getProfileAnalyticsNetworkBudget(state, now);
  const requiredTokens = trigger === 'dashboard_open' ? PROFILE_ANALYTICS_NETWORK_BACKGROUND_RESERVE + 1 : 1;
  return tokensAvailable >= requiredTokens;
}

export function recordProfileAnalyticsNetworkSync(
  state: ProfileAnalyticsSyncState,
  now: number
): ProfileAnalyticsSyncState {
  const { tokensAvailable } = getProfileAnalyticsNetworkBudget(state, now);
  return {
    ...state,
    version: 3,
    networkBudgetTokens: Math.max(0, tokensAvailable - 1),
    networkBudgetUpdatedAt: now,
    requestWindowStartedAt: undefined,
    networkCyclesInWindow: undefined,
  };
}

export function markProfileAnalyticsNetworkDirty(
  state: ProfileAnalyticsSyncState,
  dirtyAt: number
): ProfileAnalyticsSyncState {
  return {
    ...state,
    networkDirtyAt: Math.max(state.networkDirtyAt || 0, dirtyAt),
    networkNextDueAt: Math.min(state.networkNextDueAt || dirtyAt, dirtyAt),
  };
}

export function getProfileAnalyticsScheduledIntervalMs(randomValue = Math.random()): number {
  const normalized = Math.min(1, Math.max(0, randomValue));
  return Math.round(
    PROFILE_ANALYTICS_NETWORK_MIN_INTERVAL_MS +
      normalized * (PROFILE_ANALYTICS_NETWORK_MAX_INTERVAL_MS - PROFILE_ANALYTICS_NETWORK_MIN_INTERVAL_MS)
  );
}

export function isDashboardNetworkSyncDue(now: number, state?: ProfileAnalyticsSyncState): boolean {
  return (
    !state?.networkLastSuccessAt ||
    Boolean(state.networkDirtyAt && state.networkDirtyAt > state.networkLastSuccessAt) ||
    now - state.networkLastSuccessAt >= PROFILE_ANALYTICS_DASHBOARD_DEDUPE_MS
  );
}

export function isCurrentProfileAnalyticsDue({
  now,
  state,
}: {
  now: number;
  state?: ProfileAnalyticsSyncState;
}): boolean {
  if (!state?.networkLastSuccessAt) return true;
  if (state.networkNextRetryAt && now < state.networkNextRetryAt) return false;
  if (state.networkDirtyAt && state.networkDirtyAt > state.networkLastSuccessAt) return true;
  return state.networkNextDueAt
    ? now >= state.networkNextDueAt
    : now - state.networkLastSuccessAt >= PROFILE_ANALYTICS_NETWORK_SYNC_INTERVAL_MS;
}

function isDailyMetricDue(now: number, lastSuccessAt: number | undefined, nextRetryAt: number | undefined): boolean {
  if (nextRetryAt && now < nextRetryAt) return false;
  return !lastSuccessAt || now - lastSuccessAt >= PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS;
}

export function isSearchAppearancesDue({ now, state }: { now: number; state?: ProfileAnalyticsSyncState }): boolean {
  return isDailyMetricDue(now, state?.searchLastSuccessAt, state?.searchNextRetryAt);
}

export function isSocialSellingIndexDue({ now, state }: { now: number; state?: ProfileAnalyticsSyncState }): boolean {
  return isDailyMetricDue(now, state?.ssiLastSuccessAt, state?.ssiNextRetryAt);
}

function isRetryBlocked(
  now: number,
  nextRetryAt: number | undefined,
  retryKind: ProfileAnalyticsRetryKind | undefined,
  trigger: ProfileAnalyticsSyncTrigger
): boolean {
  if (!nextRetryAt || now >= nextRetryAt) return false;
  if (retryKind === 'restriction') return true;
  // A newly opened LinkedIn document can resolve a tab-specific network
  // failure immediately. It may bypass only the short standard retry; real
  // LinkedIn restrictions still remain blocked above.
  return trigger !== 'manual' && trigger !== 'linkedin_open' && trigger !== 'sign_in';
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
  return isRetryBlocked(now, state?.networkNextRetryAt, state?.networkRetryKind, trigger);
}

export function isSearchAppearancesRetryBlocked({
  now,
  state,
  trigger,
}: {
  now: number;
  state?: ProfileAnalyticsSyncState;
  trigger: ProfileAnalyticsSyncTrigger;
}): boolean {
  return isRetryBlocked(now, state?.searchNextRetryAt, state?.searchRetryKind, trigger);
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
  return isRetryBlocked(now, state?.ssiNextRetryAt, state?.ssiRetryKind, trigger);
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

export function updateMetricStatus(
  state: ProfileAnalyticsSyncState,
  metric: ProfileAnalyticsSyncMetric,
  patch: Partial<ProfileAnalyticsSyncMetricStatus> & Pick<ProfileAnalyticsSyncMetricStatus, 'status'>
): ProfileAnalyticsSyncState {
  return {
    ...state,
    status: {
      ...state.status,
      metrics: {
        ...state.status.metrics,
        [metric]: {
          ...state.status.metrics[metric],
          ...patch,
        },
      },
    },
  };
}

function triggerPriority(trigger: ProfileAnalyticsSyncTrigger): number {
  if (trigger === 'history_repair' || trigger === 'history_resume') return 6;
  if (trigger === 'profile_metadata_changed') return 5;
  if (trigger === 'manual') return 4;
  if (trigger === 'dashboard_open') return 3;
  if (trigger === 'sign_in' || trigger === 'install' || trigger === 'update' || trigger === 'linkedin_open') return 2;
  return 1;
}

/** Keeps only one strongest follow-up request while the coordinator is active. */
export function selectPendingProfileAnalyticsRequest(
  active: ProfileAnalyticsSyncRequest,
  pending: ProfileAnalyticsSyncRequest | null,
  incoming: ProfileAnalyticsSyncRequest
): ProfileAnalyticsSyncRequest | null {
  if (incoming.trigger === active.trigger && incoming.preferredTabId === active.preferredTabId) {
    return pending;
  }
  if (triggerPriority(incoming.trigger) <= triggerPriority(active.trigger) && incoming.trigger !== 'dashboard_open') {
    return pending;
  }
  if (!pending || triggerPriority(incoming.trigger) >= triggerPriority(pending.trigger)) return incoming;
  return pending;
}
