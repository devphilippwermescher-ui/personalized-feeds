export const PROFILE_VIEWERS_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const PROFILE_VIEWERS_RETRY_DELAY_MS = 2 * 60 * 60 * 1000;
export const PROFILE_VIEWERS_ATTEMPT_LEASE_MS = 5 * 60 * 1000;

export type ProfileViewersSyncTrigger =
  | 'service_worker'
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'linkedin_activity'
  | 'sign_in'
  | 'alarm'
  | 'manual';

export type ProfileViewersSyncRunType = 'initial' | 'daily' | 'retry';

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
  errorCode?: ProfileViewersSyncErrorCode;
  errorMessage?: string;
  nextScheduledAt: number;
}

export interface ProfileViewersSyncState {
  version: 1;
  userId: string;
  lastSuccessAt?: number;
  lastAttemptAt?: number;
  nextDueAt?: number;
  retryAt?: number;
  cycleStartedAt?: number;
  attemptStartedAt?: number;
  attemptExpiresAt?: number;
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
    userId,
    attemptsInCycle: 0,
    logs: [],
    updatedAt: now,
  };
}

export function decideProfileViewersSync(
  state: ProfileViewersSyncState,
  now: number,
  trigger: ProfileViewersSyncTrigger,
  force = false
): ProfileViewersSyncDecision {
  if (force) {
    return {
      shouldRun: true,
      attemptNumber: 1,
      runType: state.lastSuccessAt ? 'daily' : 'initial',
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

  if (now >= state.nextDueAt) {
    return {
      shouldRun: true,
      attemptNumber: 1,
      runType: state.lastSuccessAt ? 'daily' : 'initial',
    };
  }

  const canRetry = state.attemptsInCycle === 1 && Boolean(state.retryAt);
  const authRetryOnLinkedInActivity =
    canRetry && trigger === 'linkedin_activity' && state.lastError?.code === 'linkedin_auth_required';

  if (canRetry && ((state.retryAt || 0) <= now || authRetryOnLinkedInActivity)) {
    return { shouldRun: true, attemptNumber: 2, runType: 'retry' };
  }

  return { shouldRun: false };
}

export function startProfileViewersSyncAttempt(
  state: ProfileViewersSyncState,
  now: number,
  attemptNumber: 1 | 2
): ProfileViewersSyncState {
  const cycleStartedAt = attemptNumber === 1 ? now : state.cycleStartedAt || now;

  return {
    ...state,
    cycleStartedAt,
    attemptsInCycle: attemptNumber,
    lastAttemptAt: now,
    attemptStartedAt: now,
    attemptExpiresAt: attemptNumber === 1 ? now + PROFILE_VIEWERS_ATTEMPT_LEASE_MS : undefined,
    nextDueAt: attemptNumber === 1 ? cycleStartedAt + PROFILE_VIEWERS_SYNC_INTERVAL_MS : state.nextDueAt,
    retryAt: undefined,
    lastError: attemptNumber === 1 ? undefined : state.lastError,
    updatedAt: now,
  };
}

export function completeProfileViewersSyncSuccess(
  state: ProfileViewersSyncState,
  finishedAt: number
): ProfileViewersSyncState {
  return {
    ...state,
    lastSuccessAt: finishedAt,
    nextDueAt: finishedAt + PROFILE_VIEWERS_SYNC_INTERVAL_MS,
    retryAt: undefined,
    cycleStartedAt: undefined,
    attemptStartedAt: undefined,
    attemptExpiresAt: undefined,
    attemptsInCycle: 0,
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

  return {
    ...state,
    attemptsInCycle: attemptNumber,
    cycleStartedAt,
    nextDueAt: cycleStartedAt + PROFILE_VIEWERS_SYNC_INTERVAL_MS,
    retryAt: attemptNumber === 1 ? finishedAt + PROFILE_VIEWERS_RETRY_DELAY_MS : undefined,
    attemptStartedAt: undefined,
    attemptExpiresAt: undefined,
    lastError: {
      ...error,
      at: finishedAt,
    },
    updatedAt: finishedAt,
  };
}

export function getNextProfileViewersAlarmAt(state: ProfileViewersSyncState): number | null {
  if (
    state.attemptsInCycle === 1 &&
    state.attemptExpiresAt &&
    (!state.nextDueAt || state.attemptExpiresAt < state.nextDueAt)
  ) {
    return state.attemptExpiresAt;
  }

  if (state.attemptsInCycle === 1 && state.retryAt && (!state.nextDueAt || state.retryAt < state.nextDueAt)) {
    return state.retryAt;
  }

  return state.nextDueAt || null;
}
