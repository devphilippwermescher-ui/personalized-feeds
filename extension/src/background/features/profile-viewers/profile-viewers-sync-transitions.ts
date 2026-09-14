import {
  PROFILE_VIEWERS_ATTEMPT_LEASE_MS,
  PROFILE_VIEWERS_FIRST_FAILURE_BACKOFF_MS,
  PROFILE_VIEWERS_REPEATED_FAILURE_BACKOFF_MS,
  PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS,
  PROFILE_VIEWERS_RETRY_DELAY_MS,
  PROFILE_VIEWERS_SYNC_INTERVAL_MS,
  type ProfileViewersSyncErrorInfo,
  type ProfileViewersSyncState,
} from './profile-viewers-sync-contracts';
import { recordProfileViewersRequest } from './profile-viewers-request-budget';

function isRestrictedFailure(error: Omit<ProfileViewersSyncErrorInfo, 'at'>): boolean {
  return (
    error.code === 'app_auth_required' ||
    error.code === 'linkedin_auth_required' ||
    error.httpStatus === 401 ||
    error.httpStatus === 403 ||
    error.httpStatus === 429
  );
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
      // Every attempt needs a bounded UI lease. Retry attempt #2 is still not
      // automatically retried before the next cycle, but a terminated service
      // worker must not leave the collection indicator active indefinitely.
      attemptExpiresAt: now + PROFILE_VIEWERS_ATTEMPT_LEASE_MS,
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
