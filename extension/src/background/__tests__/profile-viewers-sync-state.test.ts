import { describe, expect, it } from 'vitest';
import {
  PROFILE_VIEWERS_ATTEMPT_LEASE_MS,
  PROFILE_VIEWERS_FIRST_FAILURE_BACKOFF_MS,
  PROFILE_VIEWERS_MAX_REQUESTS_PER_WINDOW,
  PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS,
  PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS,
  PROFILE_VIEWERS_RATE_LIMIT_WINDOW_MS,
  PROFILE_VIEWERS_REPEATED_FAILURE_BACKOFF_MS,
  PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS,
  PROFILE_VIEWERS_RETRY_DELAY_MS,
  PROFILE_VIEWERS_SYNC_INTERVAL_MS,
  completeProfileViewersSyncFailure,
  completeProfileViewersSyncSuccess,
  createProfileViewersSyncState,
  decideProfileViewersSync,
  getNextProfileViewersAlarmAt,
  getProfileViewersScheduledIntervalMs,
  recordProfileViewersRequest,
  startProfileViewersSyncAttempt,
  type ProfileViewersSyncTrigger,
} from '../profile-viewers-sync-state';

describe('profile viewers sync state', () => {
  it('starts with a resumable profile history backfill state', () => {
    const state = createProfileViewersSyncState('user-1', 1_000);

    expect(state.backfillStatus).toBe('not_started');
    expect(state.backfillPagesFetched).toBe(0);
    expect(state.backfillProfilesSaved).toBe(0);
    expect(state.recentProfileViewerUsernames).toEqual([]);
  });

  it('counts every pagination request inside the rolling request window', () => {
    const initial = createProfileViewersSyncState('user-1', 1_000);
    const firstRequest = recordProfileViewersRequest(initial, 1_000);
    const secondRequest = recordProfileViewersRequest(firstRequest, 2_000);

    expect(secondRequest.requestWindowStartedAt).toBe(1_000);
    expect(secondRequest.requestCountInWindow).toBe(2);
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
    const completed = completeProfileViewersSyncSuccess(
      started,
      now + 500,
      PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS
    );

    expect(completed.nextDueAt).toBe(now + 500 + PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS);
    expect(completed.attemptsInCycle).toBe(0);
    expect(completed.requestCountInWindow).toBe(1);
    expect(completed.consecutiveFailedCycles).toBe(0);
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

  it('caps all API attempts at 48 within a rolling 24-hour window', () => {
    const now = 60_000;
    const rateLimited = {
      ...createProfileViewersSyncState('user-1', now),
      nextDueAt: now - 1,
      requestWindowStartedAt: now,
      requestCountInWindow: PROFILE_VIEWERS_MAX_REQUESTS_PER_WINDOW,
    };

    expect(decideProfileViewersSync(rateLimited, now + 1_000, 'alarm')).toEqual({ shouldRun: false });
    expect(decideProfileViewersSync(rateLimited, now + 1_000, 'manual', true)).toEqual({
      shouldRun: false,
    });
    expect(getNextProfileViewersAlarmAt(rateLimited, now + 1_000)).toBe(
      now + PROFILE_VIEWERS_RATE_LIMIT_WINDOW_MS
    );
    expect(
      decideProfileViewersSync(rateLimited, now + PROFILE_VIEWERS_RATE_LIMIT_WINDOW_MS, 'alarm')
    ).toEqual({
      shouldRun: true,
      attemptNumber: 1,
      runType: 'initial',
    });
  });

  it('waits for cooldown after an expired rate-limit window instead of rescheduling continuously', () => {
    const now = 65_000;
    const cooldownUntil = now + PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS;
    const state = {
      ...createProfileViewersSyncState('user-1', now),
      nextDueAt: now - 1,
      cooldownUntil,
      requestWindowStartedAt: now - PROFILE_VIEWERS_RATE_LIMIT_WINDOW_MS,
      requestCountInWindow: PROFILE_VIEWERS_MAX_REQUESTS_PER_WINDOW,
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

  it('does not retry an interrupted second attempt before the next scheduled cycle', () => {
    const now = 80_000;
    const firstStarted = startProfileViewersSyncAttempt(createProfileViewersSyncState('user-1', now), now, 1);
    const secondStarted = startProfileViewersSyncAttempt(firstStarted, now + PROFILE_VIEWERS_ATTEMPT_LEASE_MS, 2);

    expect(secondStarted.attemptExpiresAt).toBeUndefined();
    expect(getNextProfileViewersAlarmAt(secondStarted)).toBe(secondStarted.nextDueAt);
  });
});
