import { describe, expect, it } from 'vitest';
import {
  PROFILE_VIEWERS_ATTEMPT_LEASE_MS,
  PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS,
  PROFILE_VIEWERS_BACKGROUND_RESERVE,
  PROFILE_VIEWERS_BUDGET_CAPACITY,
  PROFILE_VIEWERS_BUDGET_REFILL_MS,
  PROFILE_VIEWERS_FIRST_FAILURE_BACKOFF_MS,
  PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS,
  PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS,
  PROFILE_VIEWERS_REPEATED_FAILURE_BACKOFF_MS,
  PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS,
  PROFILE_VIEWERS_RETRY_DELAY_MS,
  PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION,
  PROFILE_VIEWERS_SYNC_INTERVAL_MS,
  PROFILE_VIEWERS_VISIBLE_COLLECTION_VERSION,
  completeProfileViewersSyncFailure,
  completeProfileViewersSyncSuccess,
  createProfileViewersSyncState,
  decideProfileViewersSync,
  getIncompleteProfileViewersImportDueAt,
  getNextProfileViewersAlarmAt,
  getProfileViewersAuthRecoveryPlan,
  getProfileViewersRequestBudget,
  getProfileViewersScheduledIntervalMs,
  getProfileViewersSummaryMigrationDueAt,
  isProfileViewersFirstSurfaceReady,
  prepareProfileViewersStateForPlan,
  recordProfileViewersRequest,
  scheduleProfileViewersPrivateSummaryCollection,
  startProfileViewersSyncAttempt,
  type ProfileViewersSyncTrigger,
} from '../profile-viewers-sync-state';

describe('profile viewers sync state', () => {
  it('starts with a resumable profile history backfill state', () => {
    const state = createProfileViewersSyncState('user-1', 1_000);

    expect(state.summaryCollectionVersion).toBe(PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION);
    expect(state.visibleCollectionVersion).toBe(PROFILE_VIEWERS_VISIBLE_COLLECTION_VERSION);
    expect(state.backfillStatus).toBe('not_started');
    expect(state.backfillPagesFetched).toBe(0);
    expect(state.backfillProfilesSaved).toBe(0);
    expect(state.recentProfileViewerUsernames).toEqual([]);
    expect(state.nextCollectionTask).toBe('visible');
    expect(state.privateSummaryStatus).toBe('not_started');
    expect(isProfileViewersFirstSurfaceReady(state)).toBe(false);
  });

  it('marks the sidebar ready only after visible viewers and the hidden summary are complete', () => {
    const state = createProfileViewersSyncState('user-1', 1_000);

    expect(
      isProfileViewersFirstSurfaceReady({
        ...state,
        backfillStatus: 'complete',
        privateSummaryStatus: 'scanning',
      })
    ).toBe(false);
    expect(
      isProfileViewersFirstSurfaceReady({
        ...state,
        backfillStatus: 'complete',
        privateSummaryStatus: 'ready',
      })
    ).toBe(true);
  });

  it('treats private and recruiter collection as not applicable on Free', () => {
    const now = 2_000;
    const state = prepareProfileViewersStateForPlan(createProfileViewersSyncState('user-1', 1_000), 'free', now);

    expect(state).toMatchObject({
      collectionPlan: 'free',
      backfillStatus: 'not_started',
      nextCollectionTask: 'visible',
      privateSummaryStatus: 'ready',
      nextDueAt: now,
    });
  });

  it('starts a complete visible and private backfill after upgrading to Pro', () => {
    const freeState = {
      ...prepareProfileViewersStateForPlan(createProfileViewersSyncState('user-1', 1_000), 'free' as const, 2_000),
      backfillStatus: 'complete' as const,
      backfillProfilesSaved: 10,
    };
    const upgradedAt = 3_000;
    const proState = prepareProfileViewersStateForPlan(freeState, 'pro', upgradedAt);

    expect(proState).toMatchObject({
      collectionPlan: 'pro',
      backfillStatus: 'not_started',
      backfillProfilesSaved: 0,
      nextCollectionTask: 'visible',
      privateSummaryStatus: 'not_started',
      nextDueAt: upgradedAt,
    });
  });

  it('does not reset an import while the plan remains unchanged', () => {
    const state = {
      ...prepareProfileViewersStateForPlan(createProfileViewersSyncState('user-1', 1_000), 'free' as const, 2_000),
      backfillStatus: 'in_progress' as const,
      backfillProfilesSaved: 6,
    };

    expect(prepareProfileViewersStateForPlan(state, 'free', 3_000)).toBe(state);
  });

  it('makes an idle legacy state due once for private viewer summary collection', () => {
    const now = 20_000;
    const legacyState: Partial<ReturnType<typeof createProfileViewersSyncState>> = {
      version: 1,
      schedulePolicyVersion: 2,
      userId: 'user-1',
      nextDueAt: now + PROFILE_VIEWERS_SYNC_INTERVAL_MS,
      attemptsInCycle: 0,
    };

    expect(getProfileViewersSummaryMigrationDueAt(legacyState, now)).toBe(now);
  });

  it('preserves the regular schedule after summary collection migration', () => {
    const now = 20_000;
    const nextDueAt = now + PROFILE_VIEWERS_SYNC_INTERVAL_MS;
    const currentState = {
      ...createProfileViewersSyncState('user-1', now),
      nextDueAt,
    };

    expect(getProfileViewersSummaryMigrationDueAt(currentState, now)).toBe(nextDueAt);
  });

  it('does not interrupt an active legacy sync to run the summary migration', () => {
    const now = 20_000;
    const nextDueAt = now + PROFILE_VIEWERS_SYNC_INTERVAL_MS;
    const activeLegacyState: Partial<ReturnType<typeof createProfileViewersSyncState>> = {
      version: 1,
      schedulePolicyVersion: 2,
      userId: 'user-1',
      nextDueAt,
      attemptsInCycle: 1,
    };

    expect(getProfileViewersSummaryMigrationDueAt(activeLegacyState, now)).toBe(nextDueAt);
  });

  it('spends one token per request and refills gradually', () => {
    const initial = createProfileViewersSyncState('user-1', 1_000);
    const firstRequest = recordProfileViewersRequest(initial, 1_000);
    const secondRequest = recordProfileViewersRequest(firstRequest, 1_000);

    expect(secondRequest.requestBudgetTokens).toBe(PROFILE_VIEWERS_BUDGET_CAPACITY - 2);
    expect(
      getProfileViewersRequestBudget(secondRequest, 1_000 + PROFILE_VIEWERS_BUDGET_REFILL_MS).tokensAvailable
    ).toBe(PROFILE_VIEWERS_BUDGET_CAPACITY - 1);
  });

  it('preserves a known private-summary position instead of scheduling a new full scan', () => {
    const state = {
      ...createProfileViewersSyncState('user-1', 1_000),
      privateSummaryStatus: 'ready' as const,
      privateSummaryKnownStart: 70,
      privateSummaryNextStart: 10,
      privateSummaryScanOrigin: 'full' as const,
    };

    const scheduled = scheduleProfileViewersPrivateSummaryCollection(state, { start: 10, count: 10 }, 2_000);

    expect(scheduled).toMatchObject({
      nextCollectionTask: 'private_summary',
      privateSummaryStatus: 'ready',
      privateSummaryKnownStart: 70,
      privateSummaryNextStart: undefined,
      privateSummaryScanOrigin: undefined,
    });
  });

  it('clears the alarm only when there is no durable authentication hint', () => {
    expect(
      getProfileViewersAuthRecoveryPlan({
        now: 10_000,
        nextDueAt: 20_000,
        previousAttempts: 2,
        hasAuthHint: false,
      })
    ).toEqual({
      action: 'clear_alarm',
      reason: 'no_auth_hint',
      attempts: 0,
    });
  });

  it('preserves a future due time while Firebase authentication is still restoring', () => {
    expect(
      getProfileViewersAuthRecoveryPlan({
        now: 10_000,
        nextDueAt: 20_000,
        previousAttempts: 1,
        hasAuthHint: true,
      })
    ).toEqual({
      action: 'schedule_alarm',
      reason: 'preserve_next_due',
      attempts: 1,
      scheduledAt: 20_000,
    });
  });

  it('retries an overdue sync with bounded authentication recovery backoff', () => {
    const now = 10_000;

    for (const [index, delay] of PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS.entries()) {
      expect(
        getProfileViewersAuthRecoveryPlan({
          now,
          nextDueAt: now - 1,
          previousAttempts: index,
          hasAuthHint: true,
        })
      ).toEqual({
        action: 'schedule_alarm',
        reason: 'retry_auth_restore',
        attempts: index + 1,
        scheduledAt: now + delay,
      });
    }

    expect(
      getProfileViewersAuthRecoveryPlan({
        now,
        nextDueAt: now - 1,
        previousAttempts: PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS.length + 5,
        hasAuthHint: true,
      })
    ).toEqual({
      action: 'schedule_alarm',
      reason: 'retry_auth_restore',
      attempts: PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS.length,
      scheduledAt: now + PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS[PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS.length - 1],
    });
  });

  it('uses a randomized interval between 25 and 35 minutes', () => {
    expect(getProfileViewersScheduledIntervalMs(0)).toBe(PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS);
    expect(getProfileViewersScheduledIntervalMs(0.5)).toBe(PROFILE_VIEWERS_SYNC_INTERVAL_MS);
    expect(getProfileViewersScheduledIntervalMs(1)).toBe(PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS);
  });

  it('runs immediately for a new user and schedules the next randomized run after success', () => {
    const now = 1_000;
    const initial = createProfileViewersSyncState('user-1', now);

    expect(decideProfileViewersSync(initial, now, 'service_worker')).toEqual({
      shouldRun: true,
      attemptNumber: 1,
      runType: 'initial',
    });

    const started = startProfileViewersSyncAttempt(initial, now, 1, PROFILE_VIEWERS_SYNC_INTERVAL_MS);
    const completed = completeProfileViewersSyncSuccess(started, now + 500, PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS);

    expect(completed.nextDueAt).toBe(now + 500 + PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS);
    expect(completed.attemptsInCycle).toBe(0);
    expect(completed.requestBudgetTokens).toBe(PROFILE_VIEWERS_BUDGET_CAPACITY - 1);
    expect(completed.consecutiveFailedCycles).toBe(0);
  });

  it('resumes an incomplete first import at the earliest request-safe wake', () => {
    const now = 10_000;
    const readyBudget = createProfileViewersSyncState('user-1', now);
    expect(getIncompleteProfileViewersImportDueAt(readyBudget, now)).toBe(now + 1_000);

    const emptyBudget = {
      ...readyBudget,
      requestBudgetTokens: 0,
      requestBudgetUpdatedAt: now,
    };
    expect(getIncompleteProfileViewersImportDueAt(emptyBudget, now)).toBe(now + PROFILE_VIEWERS_BUDGET_REFILL_MS);
  });

  it('does not make a request for lifecycle triggers before nextDueAt, but catches up once when overdue', () => {
    const now = 10_000;
    const started = startProfileViewersSyncAttempt(createProfileViewersSyncState('user-1', now), now, 1);
    const completed = completeProfileViewersSyncSuccess(started, now + 500, PROFILE_VIEWERS_SYNC_INTERVAL_MS);
    const triggers: ProfileViewersSyncTrigger[] = [
      'service_worker',
      'install',
      'update',
      'chrome_startup',
      'linkedin_activity',
      'sign_in',
      'alarm',
    ];

    for (const trigger of triggers) {
      expect(decideProfileViewersSync(completed, (completed.nextDueAt || 0) - 1, trigger)).toEqual({
        shouldRun: false,
      });
      expect(decideProfileViewersSync(completed, (completed.nextDueAt || 0) + 3 * 60 * 60 * 1000, trigger)).toEqual({
        shouldRun: true,
        attemptNumber: 1,
        runType: 'scheduled',
      });
    }
  });

  it('allows one transient retry after 15 minutes and backs off for one hour after the failed retry', () => {
    const now = 20_000;
    const started = startProfileViewersSyncAttempt(createProfileViewersSyncState('user-1', now), now, 1);
    const failed = completeProfileViewersSyncFailure(started, now + 500, 1, {
      code: 'network_error',
      message: 'offline',
    });

    expect(failed.retryAt).toBe(now + 500 + PROFILE_VIEWERS_RETRY_DELAY_MS);
    expect(getNextProfileViewersAlarmAt(failed)).toBe(failed.retryAt);
    expect(decideProfileViewersSync(failed, (failed.retryAt || 0) - 1, 'alarm')).toEqual({
      shouldRun: false,
    });
    expect(decideProfileViewersSync(failed, failed.retryAt || 0, 'alarm')).toEqual({
      shouldRun: true,
      attemptNumber: 2,
      runType: 'retry',
    });

    const retryStarted = startProfileViewersSyncAttempt(failed, failed.retryAt || 0, 2);
    const retryFinishedAt = (failed.retryAt || 0) + 500;
    const retryFailed = completeProfileViewersSyncFailure(retryStarted, retryFinishedAt, 2, {
      code: 'api_error',
      message: 'server error',
      httpStatus: 500,
    });

    expect(retryFailed.retryAt).toBeUndefined();
    expect(retryFailed.consecutiveFailedCycles).toBe(1);
    expect(retryFailed.nextDueAt).toBe(retryFinishedAt + PROFILE_VIEWERS_FIRST_FAILURE_BACKOFF_MS);
  });

  it('increases the failed-cycle backoff to two hours after repeated failures', () => {
    const now = 30_000;
    const state = {
      ...createProfileViewersSyncState('user-1', now),
      consecutiveFailedCycles: 1,
    };
    const firstAttempt = startProfileViewersSyncAttempt(state, now, 1);
    const firstFailure = completeProfileViewersSyncFailure(firstAttempt, now + 500, 1, {
      code: 'network_error',
      message: 'offline',
    });
    const retryAttempt = startProfileViewersSyncAttempt(firstFailure, firstFailure.retryAt || 0, 2);
    const retryFinishedAt = (firstFailure.retryAt || 0) + 500;
    const retryFailure = completeProfileViewersSyncFailure(retryAttempt, retryFinishedAt, 2, {
      code: 'network_error',
      message: 'offline',
    });

    expect(retryFailure.consecutiveFailedCycles).toBe(2);
    expect(retryFailure.nextDueAt).toBe(retryFinishedAt + PROFILE_VIEWERS_REPEATED_FAILURE_BACKOFF_MS);
  });

  it('uses a 12-hour cooldown for authentication failures but retries after LinkedIn activity', () => {
    const now = 40_000;
    const started = startProfileViewersSyncAttempt(createProfileViewersSyncState('user-1', now), now, 1);
    const failed = completeProfileViewersSyncFailure(started, now + 500, 1, {
      code: 'linkedin_auth_required',
      message: 'sign in',
      httpStatus: 403,
    });

    expect(failed.retryAt).toBe(now + 500 + PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS);
    expect(decideProfileViewersSync(failed, now + 1_000, 'alarm')).toEqual({ shouldRun: false });
    expect(decideProfileViewersSync(failed, now + 1_000, 'linkedin_activity')).toEqual({
      shouldRun: true,
      attemptNumber: 2,
      runType: 'retry',
    });
  });

  it('uses a 12-hour cooldown for HTTP 429 without an early lifecycle retry', () => {
    const now = 50_000;
    const started = startProfileViewersSyncAttempt(createProfileViewersSyncState('user-1', now), now, 1);
    const failed = completeProfileViewersSyncFailure(started, now + 500, 1, {
      code: 'api_error',
      message: 'rate limited',
      httpStatus: 429,
    });

    expect(failed.cooldownUntil).toBe(now + 500 + PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS);
    expect(decideProfileViewersSync(failed, now + 60 * 60 * 1000, 'linkedin_activity')).toEqual({
      shouldRun: false,
    });
  });

  it('waits only until the next token instead of blocking for a fixed 24-hour window', () => {
    const now = 60_000;
    const rateLimited = {
      ...createProfileViewersSyncState('user-1', now),
      nextDueAt: now - 1,
      requestBudgetTokens: 0,
      requestBudgetUpdatedAt: now,
    };

    expect(decideProfileViewersSync(rateLimited, now + 1_000, 'alarm')).toEqual({
      shouldRun: false,
    });
    expect(decideProfileViewersSync(rateLimited, now + 1_000, 'manual', true)).toEqual({
      shouldRun: false,
    });
    expect(getNextProfileViewersAlarmAt(rateLimited, now + 1_000)).toBe(now + PROFILE_VIEWERS_BUDGET_REFILL_MS);
    expect(decideProfileViewersSync(rateLimited, now + PROFILE_VIEWERS_BUDGET_REFILL_MS, 'alarm')).toEqual({
      shouldRun: true,
      attemptNumber: 1,
      runType: 'initial',
    });
  });

  it('preserves a background reserve against repeated manual syncs', () => {
    const now = 62_000;
    const state = {
      ...createProfileViewersSyncState('user-1', now),
      nextDueAt: now - 1,
      requestBudgetTokens: PROFILE_VIEWERS_BACKGROUND_RESERVE,
      requestBudgetUpdatedAt: now,
    };

    expect(decideProfileViewersSync(state, now, 'manual', true)).toEqual({
      shouldRun: false,
    });
    expect(decideProfileViewersSync(state, now, 'alarm')).toEqual({
      shouldRun: true,
      attemptNumber: 1,
      runType: 'initial',
    });
  });

  it('waits for cooldown even when the request bucket starts refilling earlier', () => {
    const now = 65_000;
    const cooldownUntil = now + PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS;
    const state = {
      ...createProfileViewersSyncState('user-1', now),
      nextDueAt: now - 1,
      cooldownUntil,
      requestBudgetTokens: 0,
      requestBudgetUpdatedAt: now,
    };

    expect(getNextProfileViewersAlarmAt(state, now)).toBe(cooldownUntil);
  });

  it('recovers the first attempt when the service worker was interrupted', () => {
    const now = 70_000;
    const started = startProfileViewersSyncAttempt(createProfileViewersSyncState('user-1', now), now, 1);

    expect(getNextProfileViewersAlarmAt(started)).toBe(now + PROFILE_VIEWERS_ATTEMPT_LEASE_MS);
    expect(decideProfileViewersSync(started, now + PROFILE_VIEWERS_ATTEMPT_LEASE_MS, 'alarm')).toEqual({
      shouldRun: true,
      attemptNumber: 2,
      runType: 'retry',
      recoveredFromInterruptedAttempt: true,
    });
  });

  it('expires the second-attempt progress lease without retrying before the next scheduled cycle', () => {
    const now = 80_000;
    const firstStarted = startProfileViewersSyncAttempt(createProfileViewersSyncState('user-1', now), now, 1);
    const secondStarted = startProfileViewersSyncAttempt(firstStarted, now + PROFILE_VIEWERS_ATTEMPT_LEASE_MS, 2);

    expect(secondStarted.attemptExpiresAt).toBe(now + PROFILE_VIEWERS_ATTEMPT_LEASE_MS * 2);
    expect(getNextProfileViewersAlarmAt(secondStarted)).toBe(secondStarted.nextDueAt);
  });
});
