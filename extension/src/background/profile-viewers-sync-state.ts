export const PROFILE_VIEWERS_SYNC_INTERVAL_MS = 30 * 60 * 1000;
export const PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS = 25 * 60 * 1000;
export const PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS = 35 * 60 * 1000;
export const PROFILE_VIEWERS_RETRY_DELAY_MS = 15 * 60 * 1000;
export const PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS = 12 * 60 * 60 * 1000;
export const PROFILE_VIEWERS_FIRST_FAILURE_BACKOFF_MS = 60 * 60 * 1000;
export const PROFILE_VIEWERS_REPEATED_FAILURE_BACKOFF_MS = 2 * 60 * 60 * 1000;
export const PROFILE_VIEWERS_ATTEMPT_LEASE_MS = 5 * 60 * 1000;
export const PROFILE_VIEWERS_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PROFILE_VIEWERS_MAX_REQUESTS_PER_WINDOW = 48;

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
  savedCount: number;
  newCount: number;
  updatedCount: number;
  visibleProfileUsernames: string[];
  newProfileUsernames: string[];
  recoveredFromInterruptedAttempt?: boolean;
  requestCountInWindow?: number;
  rateLimitResetAt?: number;
  scheduledIntervalMs?: number;
  consecutiveFailedCycles?: number;
  cooldownUntil?: number;
  requestCount?: number;
  pagesFetched?: number;
  paginationComplete?: boolean;
  paginationMode?: 'backfill' | 'incremental';
  backfillStatus?: ProfileViewersBackfillStatus;
  errorCode?: ProfileViewersSyncErrorCode;
  errorMessage?: string;
  nextScheduledAt: number;
}

export interface ProfileViewersSyncState {
  version: 1;
  schedulePolicyVersion: 2;
  userId: string;
  lastSuccessAt?: number;
  lastAttemptAt?: number;
  nextDueAt?: number;
  retryAt?: number;
  cycleStartedAt?: number;
  attemptStartedAt?: number;
  attemptExpiresAt?: number;
  cooldownUntil?: number;
  requestWindowStartedAt?: number;
  requestCountInWindow: number;
  consecutiveFailedCycles: number;
  backfillStatus: ProfileViewersBackfillStatus;
  backfillNextStart?: number;
  backfillPageSize?: number;
  backfillStartedAt?: number;
  backfillCompletedAt?: number;
  backfillPagesFetched: number;
  backfillProfilesSaved: number;
  recentProfileViewerUsernames: string[];
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

export function createProfileViewersSyncState(userId: string, now: number): ProfileViewersSyncState {
  return {
    version: 1,
    schedulePolicyVersion: 2,
    userId,
    requestCountInWindow: 0,
    consecutiveFailedCycles: 0,
    backfillStatus: 'not_started',
    backfillPagesFetched: 0,
    backfillProfilesSaved: 0,
    recentProfileViewerUsernames: [],
    attemptsInCycle: 0,
    logs: [],
    updatedAt: now,
  };
}

export function canMakeProfileViewersRequest(state: ProfileViewersSyncState, now: number): boolean {
  return !isProfileViewersRateLimited(state, now);
}

export function recordProfileViewersRequest(
  state: ProfileViewersSyncState,
  now: number
): ProfileViewersSyncState {
  const rateLimitResetAt = getProfileViewersRateLimitResetAt(state);
  const requestWindowExpired = !rateLimitResetAt || now >= rateLimitResetAt;

  return {
    ...state,
    requestWindowStartedAt: requestWindowExpired ? now : state.requestWindowStartedAt,
    requestCountInWindow: requestWindowExpired ? 1 : state.requestCountInWindow + 1,
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

export function getProfileViewersRateLimitResetAt(state: ProfileViewersSyncState): number | undefined {
  return state.requestWindowStartedAt
    ? state.requestWindowStartedAt + PROFILE_VIEWERS_RATE_LIMIT_WINDOW_MS
    : undefined;
}

function isProfileViewersRateLimited(state: ProfileViewersSyncState, now: number): boolean {
  const resetAt = getProfileViewersRateLimitResetAt(state);
  return (
    Boolean(resetAt && now < resetAt) &&
    state.requestCountInWindow >= PROFILE_VIEWERS_MAX_REQUESTS_PER_WINDOW
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
  if (isProfileViewersRateLimited(state, now)) {
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

  return recordProfileViewersRequest({
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
  }, now);
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
  const retryDelay = restrictedFailure
    ? PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS
    : PROFILE_VIEWERS_RETRY_DELAY_MS;
  const failedCycleBackoff =
    failedCycles >= 2
      ? PROFILE_VIEWERS_REPEATED_FAILURE_BACKOFF_MS
      : PROFILE_VIEWERS_FIRST_FAILURE_BACKOFF_MS;
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
    cooldownUntil: restrictedFailure
      ? attemptNumber === 1
        ? finishedAt + retryDelay
        : nextDueAt
      : undefined,
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

export function getNextProfileViewersAlarmAt(
  state: ProfileViewersSyncState,
  now = Date.now()
): number | null {
  const rateLimitResetAt = getProfileViewersRateLimitResetAt(state);
  if (
    state.requestCountInWindow >= PROFILE_VIEWERS_MAX_REQUESTS_PER_WINDOW &&
    rateLimitResetAt &&
    rateLimitResetAt > now
  ) {
    return rateLimitResetAt;
  }

  if (
    state.attemptsInCycle === 1 &&
    state.attemptExpiresAt &&
    (!state.nextDueAt || state.attemptExpiresAt < state.nextDueAt)
  ) {
    return state.attemptExpiresAt;
  }

  const retryAt =
    state.attemptsInCycle === 1 && state.retryAt
      ? Math.max(state.retryAt, state.cooldownUntil || 0)
      : undefined;
  const nextDueAt = state.nextDueAt
    ? Math.max(state.nextDueAt, state.cooldownUntil || 0)
    : undefined;

  if (retryAt && (!nextDueAt || retryAt < nextDueAt)) {
    return retryAt;
  }

  return nextDueAt || retryAt || null;
}
