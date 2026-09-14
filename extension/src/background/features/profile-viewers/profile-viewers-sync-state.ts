import { PROFILE_VIEWERS_PAGINATION_PAGE_SIZE } from './profile-viewers-pagination';
import type { AppPlan } from 'shared/plans';
import {
  PROFILE_VIEWERS_ATTEMPT_LEASE_MS,
  PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS,
  PROFILE_VIEWERS_BACKGROUND_RESERVE,
  PROFILE_VIEWERS_BUDGET_CAPACITY,
  PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS,
  PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS,
  PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION,
  PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION,
  PROFILE_VIEWERS_VISIBLE_COLLECTION_VERSION,
  type ProfileViewersSyncRunType,
  type ProfileViewersSyncState,
  type ProfileViewersSyncTrigger,
} from './profile-viewers-sync-contracts';
import {
  canMakeProfileViewersRequest,
  getProfileViewersRequestBudget,
} from './profile-viewers-request-budget';

export * from './profile-viewers-sync-contracts';
export * from './profile-viewers-request-budget';
export * from './profile-viewers-sync-transitions';

export function prepareProfileViewersStateForPlan(
  state: ProfileViewersSyncState,
  plan: AppPlan,
  now: number
): ProfileViewersSyncState {
  if (state.collectionPlan === plan) {
    return state;
  }

  return {
    ...state,
    collectionPlan: plan,
    backfillStatus: 'not_started',
    backfillNextStart: undefined,
    backfillPageSize: undefined,
    backfillStartedAt: undefined,
    backfillCompletedAt: undefined,
    backfillPagesFetched: 0,
    backfillProfilesSaved: 0,
    recentProfileViewerUsernames: [],
    nextCollectionTask: 'visible',
    privateSummaryStatus: plan === 'pro' ? 'not_started' : 'ready',
    privateSummaryNextStart: undefined,
    privateSummaryPageSize: undefined,
    privateSummaryKnownStart: undefined,
    privateSummaryScanOrigin: undefined,
    privateSummaryLastAttemptAt: undefined,
    privateSummaryLastSuccessAt: undefined,
    nextDueAt: now,
    retryAt: undefined,
    updatedAt: now,
  };
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
    visibleCollectionVersion: PROFILE_VIEWERS_VISIBLE_COLLECTION_VERSION,
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
      : state.privateSummaryNextStart || continuationCursor?.start || PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
    privateSummaryPageSize:
      state.privateSummaryPageSize || continuationCursor?.count || PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
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

export function getProfileViewersScheduledIntervalMs(randomValue = Math.random()): number {
  const normalizedRandomValue = Math.min(1, Math.max(0, randomValue));
  return Math.round(
    PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS +
      normalizedRandomValue * (PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS - PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS)
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

export function getNextProfileViewersAlarmAt(state: ProfileViewersSyncState, now = Date.now()): number | null {
  if (
    state.attemptsInCycle === 1 &&
    state.attemptExpiresAt &&
    (!state.nextDueAt || state.attemptExpiresAt < state.nextDueAt)
  ) {
    return state.attemptExpiresAt;
  }

  const budget = getProfileViewersRequestBudget(state, now);
  const budgetAvailableAt = budget.tokensAvailable < 1 ? budget.nextTokenAt || 0 : 0;
  const retryAt =
    state.attemptsInCycle === 1 && state.retryAt
      ? Math.max(state.retryAt, state.cooldownUntil || 0, budgetAvailableAt)
      : undefined;
  const nextDueAt = state.nextDueAt
    ? Math.max(state.nextDueAt, state.cooldownUntil || 0, budgetAvailableAt)
    : budgetAvailableAt || undefined;

  if (retryAt && (!nextDueAt || retryAt < nextDueAt)) {
    return retryAt;
  }

  return nextDueAt || retryAt || null;
}
