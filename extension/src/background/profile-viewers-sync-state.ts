import { PROFILE_VIEWERS_PAGINATION_PAGE_SIZE } from './profile-viewers-pagination';

export const PROFILE_VIEWERS_SYNC_INTERVAL_MS = 30 * 60 * 1000;
export const PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS = 25 * 60 * 1000;
export const PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS = 35 * 60 * 1000;
export const PROFILE_VIEWERS_RETRY_DELAY_MS = 15 * 60 * 1000;
export const PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS = 12 * 60 * 60 * 1000;
export const PROFILE_VIEWERS_FIRST_FAILURE_BACKOFF_MS = 60 * 60 * 1000;
export const PROFILE_VIEWERS_REPEATED_FAILURE_BACKOFF_MS = 2 * 60 * 60 * 1000;
export const PROFILE_VIEWERS_ATTEMPT_LEASE_MS = 5 * 60 * 1000;
export const PROFILE_VIEWERS_BUDGET_CAPACITY = 72;
export const PROFILE_VIEWERS_BUDGET_REFILL_MS = 20 * 60 * 1000;
export const PROFILE_VIEWERS_BACKGROUND_RESERVE = 8;
export const PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION = 3;
export const PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION = 2;
export const PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS = [
  2 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;

export type ProfileViewersSyncTrigger =
  | 'service_worker'
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'linkedin_activity'
  | 'sign_in'
  | 'alarm'
  | 'manual';

export type ProfileViewersSyncRunType = 'initial' | 'scheduled' | 'retry';
export type ProfileViewersBackfillStatus = 'not_started' | 'in_progress' | 'complete';
export type ProfileViewersCollectionTask = 'visible' | 'private_summary';
export type ProfileViewersPrivateSummaryStatus = 'not_started' | 'scanning' | 'ready';
export type ProfileViewersPrivateSummaryScanOrigin = 'full' | 'known_position';

export type ProfileViewersSyncErrorCode =
  | 'app_auth_required'
  | 'linkedin_auth_required'
  | 'network_error'
  | 'api_error'
  | 'parse_error'
  | 'unknown_error';

export interface ProfileViewersSyncErrorInfo {
  code: ProfileViewersSyncErrorCode;
  message: string;
  at: number;
  httpStatus?: number;
}

export interface ProfileViewersSyncLog {
  id: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  trigger: ProfileViewersSyncTrigger;
  runType: ProfileViewersSyncRunType;
  attemptNumber: 1 | 2;
  status: 'success' | 'no_changes' | 'auth_error' | 'network_error' | 'api_error' | 'parse_error' | 'unknown_error';
  httpStatus?: number;
  responseLength?: number;
  visibleCount: number;
  visibleSearchCount?: number;
  privateViewerCount?: number;
  recruiterViewerCount?: number;
  recruiterViewerUrl?: string;
  savedCount: number;
  searchSavedCount?: number;
  newCount: number;
  newSearchCount?: number;
  updatedCount: number;
  visibleProfileUsernames: string[];
  newProfileUsernames: string[];
  recoveredFromInterruptedAttempt?: boolean;
  budgetTokensAvailable?: number;
  budgetNextTokenAt?: number;
  /** @deprecated Fixed-window diagnostics retained only in legacy logs. */
  requestCountInWindow?: number;
  /** @deprecated Fixed-window diagnostics retained only in legacy logs. */
  rateLimitResetAt?: number;
  scheduledIntervalMs?: number;
  consecutiveFailedCycles?: number;
  cooldownUntil?: number;
  requestCount?: number;
  pagesFetched?: number;
  paginationComplete?: boolean;
  paginationMode?: 'backfill' | 'incremental';
  collectionTask?: ProfileViewersCollectionTask;
  backfillStatus?: ProfileViewersBackfillStatus;
  errorCode?: ProfileViewersSyncErrorCode;
  errorMessage?: string;
  nextScheduledAt: number;
}

export interface ProfileViewersSyncState {
  version: 1;
  schedulePolicyVersion: 2 | 3;
  summaryCollectionVersion: 2;
  userId: string;
  lastSuccessAt?: number;
  lastAttemptAt?: number;
  nextDueAt?: number;
  retryAt?: number;
  cycleStartedAt?: number;
  attemptStartedAt?: number;
  attemptExpiresAt?: number;
  cooldownUntil?: number;
  /** @deprecated Fixed-window state retained only while old local data migrates. */
  requestWindowStartedAt?: number;
  /** @deprecated Fixed-window state retained only while old local data migrates. */
  requestCountInWindow?: number;
  requestBudgetTokens: number;
  requestBudgetUpdatedAt: number;
  consecutiveFailedCycles: number;
  authRecoveryAttempts: number;
  authRecoveryAt?: number;
  backfillStatus: ProfileViewersBackfillStatus;
  backfillNextStart?: number;
  backfillPageSize?: number;
  backfillStartedAt?: number;
  backfillCompletedAt?: number;
  backfillPagesFetched: number;
  backfillProfilesSaved: number;
  recentProfileViewerUsernames: string[];
  nextCollectionTask: ProfileViewersCollectionTask;
  privateSummaryStatus: ProfileViewersPrivateSummaryStatus;
  privateSummaryNextStart?: number;
  privateSummaryPageSize?: number;
  privateSummaryKnownStart?: number;
  privateSummaryScanOrigin?: ProfileViewersPrivateSummaryScanOrigin;
  privateSummaryLastAttemptAt?: number;
  privateSummaryLastSuccessAt?: number;
  attemptsInCycle: 0 | 1 | 2;
  lastError?: ProfileViewersSyncErrorInfo;
  logs: ProfileViewersSyncLog[];
  updatedAt: number;
}

export interface ProfileViewersSyncDecision {
  shouldRun: boolean;
  attemptNumber?: 1 | 2;
  runType?: ProfileViewersSyncRunType;
  recoveredFromInterruptedAttempt?: boolean;
}

export type ProfileViewersAuthRecoveryPlan =
  | {
      action: 'clear_alarm';
      reason: 'no_auth_hint';
      attempts: 0;
    }
  | {
      action: 'schedule_alarm';
      reason: 'preserve_next_due' | 'retry_auth_restore';
      attempts: number;
      scheduledAt: number;
    };

export function createProfileViewersSyncState(userId: string, now: number): ProfileViewersSyncState {
  return {
    version: 1,
    schedulePolicyVersion: PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION,
    summaryCollectionVersion: PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION,
    userId,
    requestBudgetTokens: PROFILE_VIEWERS_BUDGET_CAPACITY,
    requestBudgetUpdatedAt: now,
    consecutiveFailedCycles: 0,
    authRecoveryAttempts: 0,
    backfillStatus: 'not_started',
    backfillPagesFetched: 0,
    backfillProfilesSaved: 0,
    recentProfileViewerUsernames: [],
    nextCollectionTask: 'visible',
    privateSummaryStatus: 'not_started',
    attemptsInCycle: 0,
    logs: [],
    updatedAt: now,
  };
}

export function isProfileViewersFirstSurfaceReady(
  state: Pick<ProfileViewersSyncState, 'backfillStatus' | 'privateSummaryStatus'>
): boolean {
  return state.backfillStatus === 'complete' && state.privateSummaryStatus === 'ready';
}

export function scheduleProfileViewersPrivateSummaryCollection(
  state: ProfileViewersSyncState,
  continuationCursor: { start: number; count: number } | null,
  now: number
): ProfileViewersSyncState {
  const hasKnownPosition = typeof state.privateSummaryKnownStart === 'number';
  const hasCheckpoint = !hasKnownPosition && typeof state.privateSummaryNextStart === 'number';

  return {
    ...state,
    nextCollectionTask: 'private_summary',
    privateSummaryStatus: hasKnownPosition ? 'ready' : 'scanning',
    privateSummaryNextStart: hasKnownPosition
      ? undefined
      : state.privateSummaryNextStart ||
        continuationCursor?.start ||
        PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
    privateSummaryPageSize:
      state.privateSummaryPageSize ||
      continuationCursor?.count ||
      PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
    privateSummaryScanOrigin: hasKnownPosition
      ? undefined
      : hasCheckpoint && state.privateSummaryScanOrigin
        ? state.privateSummaryScanOrigin
        : 'full',
    privateSummaryLastAttemptAt: now,
    updatedAt: now,
  };
}

export function getProfileViewersSummaryMigrationDueAt(
  state: Partial<ProfileViewersSyncState>,
  now: number
): number | undefined {
  if (
    state.summaryCollectionVersion === PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION ||
    state.attemptsInCycle === 1 ||
    state.attemptsInCycle === 2
  ) {
    return state.nextDueAt;
  }

  return now;
}

export function getProfileViewersAuthRecoveryPlan({
  now,
  nextDueAt,
  previousAttempts,
  hasAuthHint,
}: {
  now: number;
  nextDueAt?: number;
  previousAttempts: number;
  hasAuthHint: boolean;
}): ProfileViewersAuthRecoveryPlan {
  if (!hasAuthHint) {
    return {
      action: 'clear_alarm',
      reason: 'no_auth_hint',
      attempts: 0,
    };
  }

  if (nextDueAt && nextDueAt > now) {
    return {
      action: 'schedule_alarm',
      reason: 'preserve_next_due',
      attempts: Math.max(0, previousAttempts),
      scheduledAt: nextDueAt,
    };
  }

  const attempts = Math.min(Math.max(0, previousAttempts) + 1, PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS.length);
  const delayIndex = Math.min(attempts - 1, PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS.length - 1);

  return {
    action: 'schedule_alarm',
    reason: 'retry_auth_restore',
    attempts,
    scheduledAt: now + PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS[delayIndex],
  };
}

export interface ProfileViewersRequestBudget {
  tokensAvailable: number;
  nextTokenAt?: number;
}

export function getProfileViewersRequestBudget(
  state: ProfileViewersSyncState,
  now: number
): ProfileViewersRequestBudget {
  if (
    typeof state.requestBudgetTokens !== 'number' ||
    !Number.isFinite(state.requestBudgetTokens) ||
    typeof state.requestBudgetUpdatedAt !== 'number' ||
    !Number.isFinite(state.requestBudgetUpdatedAt)
  ) {
    return { tokensAvailable: PROFILE_VIEWERS_BUDGET_CAPACITY };
  }

  const elapsed = Math.max(0, now - state.requestBudgetUpdatedAt);
  const tokensAvailable = Math.min(
    PROFILE_VIEWERS_BUDGET_CAPACITY,
    Math.max(0, state.requestBudgetTokens) + elapsed / PROFILE_VIEWERS_BUDGET_REFILL_MS
  );
  if (tokensAvailable >= PROFILE_VIEWERS_BUDGET_CAPACITY) {
    return { tokensAvailable };
  }

  const nextWholeToken = Math.floor(tokensAvailable) + 1;
  return {
    tokensAvailable,
    nextTokenAt:
      now +
      Math.ceil(
        (nextWholeToken - tokensAvailable) *
          PROFILE_VIEWERS_BUDGET_REFILL_MS
      ),
  };
}

export function canMakeProfileViewersRequest(
  state: ProfileViewersSyncState,
  now: number,
  reserveTokens = 0
): boolean {
  return getProfileViewersRequestBudget(state, now).tokensAvailable >= reserveTokens + 1;
}

export function recordProfileViewersRequest(
  state: ProfileViewersSyncState,
  now: number
): ProfileViewersSyncState {
  const { tokensAvailable } = getProfileViewersRequestBudget(state, now);

  return {
    ...state,
    schedulePolicyVersion: PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION,
    requestBudgetTokens: Math.max(0, tokensAvailable - 1),
    requestBudgetUpdatedAt: now,
    requestWindowStartedAt: undefined,
    requestCountInWindow: undefined,
    updatedAt: now,
  };
}

export function getProfileViewersScheduledIntervalMs(randomValue = Math.random()): number {
  const normalizedRandomValue = Math.min(1, Math.max(0, randomValue));
  return Math.round(
    PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS +
      normalizedRandomValue * (PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS - PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS)
  );
}

function isRestrictedFailure(error: Omit<ProfileViewersSyncErrorInfo, 'at'>): boolean {
  return (
    error.code === 'app_auth_required' ||
    error.code === 'linkedin_auth_required' ||
    error.httpStatus === 401 ||
    error.httpStatus === 403 ||
    error.httpStatus === 429
  );
}

export function decideProfileViewersSync(
  state: ProfileViewersSyncState,
  now: number,
  trigger: ProfileViewersSyncTrigger,
  force = false
): ProfileViewersSyncDecision {
  const reserveTokens = trigger === 'manual' ? PROFILE_VIEWERS_BACKGROUND_RESERVE : 0;
  if (!canMakeProfileViewersRequest(state, now, reserveTokens)) {
    return { shouldRun: false };
  }

  const canRetry = state.attemptsInCycle === 1 && Boolean(state.retryAt);
  const authRetryOnLinkedInActivity =
    canRetry && trigger === 'linkedin_activity' && state.lastError?.code === 'linkedin_auth_required';
  if (authRetryOnLinkedInActivity) {
    return { shouldRun: true, attemptNumber: 2, runType: 'retry' };
  }

  if (state.cooldownUntil && now < state.cooldownUntil) {
    return { shouldRun: false };
  }

  if (force) {
    return {
      shouldRun: true,
      attemptNumber: 1,
      runType: state.lastSuccessAt ? 'scheduled' : 'initial',
    };
  }

  const interruptedAttemptExpiresAt =
    state.attemptsInCycle === 1 && !state.retryAt && !state.lastError
      ? state.attemptExpiresAt ||
        (state.lastAttemptAt ? state.lastAttemptAt + PROFILE_VIEWERS_ATTEMPT_LEASE_MS : undefined)
      : undefined;
  if (interruptedAttemptExpiresAt && now >= interruptedAttemptExpiresAt) {
    return {
      shouldRun: true,
      attemptNumber: 2,
      runType: 'retry',
      recoveredFromInterruptedAttempt: true,
    };
  }

  if (!state.nextDueAt) {
    return { shouldRun: true, attemptNumber: 1, runType: 'initial' };
  }

  if (canRetry && (state.retryAt || 0) <= now) {
    return { shouldRun: true, attemptNumber: 2, runType: 'retry' };
  }

  if (now >= state.nextDueAt) {
    return {
      shouldRun: true,
      attemptNumber: 1,
      runType: state.lastSuccessAt ? 'scheduled' : 'initial',
    };
  }

  return { shouldRun: false };
}

export function startProfileViewersSyncAttempt(
  state: ProfileViewersSyncState,
  now: number,
  attemptNumber: 1 | 2,
  scheduledIntervalMs = PROFILE_VIEWERS_SYNC_INTERVAL_MS
): ProfileViewersSyncState {
  const cycleStartedAt = attemptNumber === 1 ? now : state.cycleStartedAt || now;

  return recordProfileViewersRequest(
    {
      ...state,
      cycleStartedAt,
      attemptsInCycle: attemptNumber,
      lastAttemptAt: now,
      attemptStartedAt: now,
      attemptExpiresAt: attemptNumber === 1 ? now + PROFILE_VIEWERS_ATTEMPT_LEASE_MS : undefined,
      nextDueAt: attemptNumber === 1 ? now + scheduledIntervalMs : state.nextDueAt,
      retryAt: undefined,
      cooldownUntil: undefined,
      lastError: attemptNumber === 1 ? undefined : state.lastError,
      updatedAt: now,
    },
    now
  );
}

export function completeProfileViewersSyncSuccess(
  state: ProfileViewersSyncState,
  finishedAt: number,
  scheduledIntervalMs = PROFILE_VIEWERS_SYNC_INTERVAL_MS
): ProfileViewersSyncState {
  return {
    ...state,
    lastSuccessAt: finishedAt,
    nextDueAt: finishedAt + scheduledIntervalMs,
    retryAt: undefined,
    cooldownUntil: undefined,
    cycleStartedAt: undefined,
    attemptStartedAt: undefined,
    attemptExpiresAt: undefined,
    attemptsInCycle: 0,
    consecutiveFailedCycles: 0,
    lastError: undefined,
    updatedAt: finishedAt,
  };
}

export function completeProfileViewersSyncFailure(
  state: ProfileViewersSyncState,
  finishedAt: number,
  attemptNumber: 1 | 2,
  error: Omit<ProfileViewersSyncErrorInfo, 'at'>
): ProfileViewersSyncState {
  const cycleStartedAt = state.cycleStartedAt || finishedAt;
  const restrictedFailure = isRestrictedFailure(error);
  const failedCycles = attemptNumber === 2 ? state.consecutiveFailedCycles + 1 : state.consecutiveFailedCycles;
  const retryDelay = restrictedFailure ? PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS : PROFILE_VIEWERS_RETRY_DELAY_MS;
  const failedCycleBackoff =
    failedCycles >= 2 ? PROFILE_VIEWERS_REPEATED_FAILURE_BACKOFF_MS : PROFILE_VIEWERS_FIRST_FAILURE_BACKOFF_MS;
  const nextDueAt =
    attemptNumber === 1
      ? restrictedFailure
        ? finishedAt + retryDelay
        : state.nextDueAt || cycleStartedAt + PROFILE_VIEWERS_SYNC_INTERVAL_MS
      : finishedAt + (restrictedFailure ? PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS : failedCycleBackoff);

  return {
    ...state,
    attemptsInCycle: attemptNumber,
    cycleStartedAt,
    nextDueAt,
    retryAt: attemptNumber === 1 ? finishedAt + retryDelay : undefined,
    cooldownUntil: restrictedFailure ? (attemptNumber === 1 ? finishedAt + retryDelay : nextDueAt) : undefined,
    attemptStartedAt: undefined,
    attemptExpiresAt: undefined,
    consecutiveFailedCycles: failedCycles,
    lastError: {
      ...error,
      at: finishedAt,
    },
    updatedAt: finishedAt,
  };
}

export function getNextProfileViewersAlarmAt(state: ProfileViewersSyncState, now = Date.now()): number | null {
  if (
    state.attemptsInCycle === 1 &&
    state.attemptExpiresAt &&
    (!state.nextDueAt || state.attemptExpiresAt < state.nextDueAt)
  ) {
    return state.attemptExpiresAt;
  }

  const budget = getProfileViewersRequestBudget(state, now);
  const budgetAvailableAt =
    budget.tokensAvailable < 1 ? budget.nextTokenAt || 0 : 0;
  const retryAt =
    state.attemptsInCycle === 1 && state.retryAt
      ? Math.max(
          state.retryAt,
          state.cooldownUntil || 0,
          budgetAvailableAt
        )
      : undefined;
  const nextDueAt = state.nextDueAt
    ? Math.max(
        state.nextDueAt,
        state.cooldownUntil || 0,
        budgetAvailableAt
      )
    : budgetAvailableAt || undefined;

  if (retryAt && (!nextDueAt || retryAt < nextDueAt)) {
    return retryAt;
  }

  return nextDueAt || retryAt || null;
}
