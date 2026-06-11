import { describe, expect, it } from 'vitest';
import {
  PROFILE_VIEWERS_RETRY_DELAY_MS,
  PROFILE_VIEWERS_SYNC_INTERVAL_MS,
  completeProfileViewersSyncFailure,
  completeProfileViewersSyncSuccess,
  createProfileViewersSyncState,
  decideProfileViewersSync,
  getNextProfileViewersAlarmAt,
  startProfileViewersSyncAttempt,
} from '../profile-viewers-sync-state';

describe('profile viewers sync state', () => {
  it('runs immediately for a new user and schedules the next run 24 hours after success', () => {
    const now = 1_000;
    const initial = createProfileViewersSyncState('user-1', now);
    const decision = decideProfileViewersSync(initial, now, 'service_worker');

    expect(decision).toEqual({
      shouldRun: true,
      attemptNumber: 1,
      runType: 'initial',
    });

    const started = startProfileViewersSyncAttempt(initial, now, 1);
    const completed = completeProfileViewersSyncSuccess(started, now + 500);

    expect(completed.nextDueAt).toBe(now + 500 + PROFILE_VIEWERS_SYNC_INTERVAL_MS);
    expect(completed.attemptsInCycle).toBe(0);
    expect(decideProfileViewersSync(completed, now + 60_000, 'linkedin_activity').shouldRun).toBe(false);
  });

  it('allows one retry after two hours and then waits for the next daily cycle', () => {
    const now = 10_000;
    const initial = createProfileViewersSyncState('user-1', now);
    const started = startProfileViewersSyncAttempt(initial, now, 1);
    const failed = completeProfileViewersSyncFailure(started, now + 500, 1, {
      code: 'network_error',
      message: 'offline',
    });

    expect(failed.retryAt).toBe(now + 500 + PROFILE_VIEWERS_RETRY_DELAY_MS);
    expect(getNextProfileViewersAlarmAt(failed)).toBe(failed.retryAt);
    expect(decideProfileViewersSync(failed, (failed.retryAt || 0) - 1, 'alarm').shouldRun).toBe(false);

    const retryDecision = decideProfileViewersSync(failed, failed.retryAt || 0, 'alarm');
    expect(retryDecision).toEqual({
      shouldRun: true,
      attemptNumber: 2,
      runType: 'retry',
    });

    const retryStarted = startProfileViewersSyncAttempt(failed, failed.retryAt || 0, 2);
    const retryFailed = completeProfileViewersSyncFailure(retryStarted, (failed.retryAt || 0) + 500, 2, {
      code: 'api_error',
      message: 'server error',
      httpStatus: 500,
    });

    expect(retryFailed.retryAt).toBeUndefined();
    expect(getNextProfileViewersAlarmAt(retryFailed)).toBe(now + PROFILE_VIEWERS_SYNC_INTERVAL_MS);
    expect(decideProfileViewersSync(retryFailed, now + PROFILE_VIEWERS_SYNC_INTERVAL_MS, 'alarm')).toEqual({
      shouldRun: true,
      attemptNumber: 1,
      runType: 'initial',
    });
  });

  it('can retry a LinkedIn authentication failure on the next LinkedIn activity', () => {
    const now = 20_000;
    const started = startProfileViewersSyncAttempt(createProfileViewersSyncState('user-1', now), now, 1);
    const failed = completeProfileViewersSyncFailure(started, now + 500, 1, {
      code: 'linkedin_auth_required',
      message: 'sign in',
      httpStatus: 403,
    });

    expect(decideProfileViewersSync(failed, now + 1_000, 'linkedin_activity')).toEqual({
      shouldRun: true,
      attemptNumber: 2,
      runType: 'retry',
    });
  });
});
