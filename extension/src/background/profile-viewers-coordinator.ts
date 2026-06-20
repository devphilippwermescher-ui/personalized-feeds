import {
  completeProfileViewersSyncFailure,
  completeProfileViewersSyncSuccess,
  canMakeProfileViewersRequest,
  createProfileViewersSyncState,
  decideProfileViewersSync,
  getNextProfileViewersAlarmAt,
  getProfileViewersAuthRecoveryPlan,
  getProfileViewersRateLimitResetAt,
  getProfileViewersScheduledIntervalMs,
  startProfileViewersSyncAttempt,
  type ProfileViewersSyncErrorCode,
  type ProfileViewersSyncLog,
  type ProfileViewersSyncRunType,
  type ProfileViewersSyncState,
  type ProfileViewersSyncTrigger,
} from './profile-viewers-sync-state';
import {
  getAuthenticatedFeedsUser,
  getStoredFeedsAuthContext,
} from './feeds-auth';
import { ProfileViewersSyncError } from './profile-viewers-error';
import { syncProfileViewersViaApi } from './profile-viewers-sync-service';
import {
  appendProfileViewersWakeEvent,
  clearProfileViewersAlarm,
  getProfileViewersSyncState,
  getStoredProfileViewersSyncState,
  scheduleNextProfileViewersAlarm,
  scheduleProfileViewersAlarmAt,
  setProfileViewersAuthRecoveryState,
  setProfileViewersSyncState,
  type ProfileViewersSyncCoordinatorResult,
} from './profile-viewers-coordinator-storage';
import { queueProfileViewersStatusSync } from './profile-viewers-status-sync';

const PROFILE_VIEWERS_SYNC_LOG_LIMIT = 50;
const PROFILE_VIEWERS_SYNC_LOG_USERNAME_LIMIT = 50;
let profileViewersSyncCoordinatorPromise: Promise<ProfileViewersSyncCoordinatorResult> | null = null;

function getProfileViewersSyncError(error: unknown): {
  code: ProfileViewersSyncErrorCode;
  message: string;
  httpStatus?: number;
} {
  if (error instanceof ProfileViewersSyncError) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: error.httpStatus,
    };
  }

  const message = error instanceof Error ? error.message : String(error || 'Unknown profile visitors sync error');
  const normalized = message.toLowerCase();
  if (normalized.includes('network') || normalized.includes('failed to fetch')) {
    return { code: 'network_error', message };
  }

  return { code: 'unknown_error', message };
}

function getProfileViewersSyncLogStatus(
  errorCode?: ProfileViewersSyncErrorCode,
  newCount = 0
): ProfileViewersSyncLog['status'] {
  if (!errorCode) {
    return newCount > 0 ? 'success' : 'no_changes';
  }

  if (errorCode === 'app_auth_required' || errorCode === 'linkedin_auth_required') {
    return 'auth_error';
  }

  if (errorCode === 'network_error') {
    return 'network_error';
  }

  if (errorCode === 'api_error') {
    return 'api_error';
  }

  if (errorCode === 'parse_error') {
    return 'parse_error';
  }

  return 'unknown_error';
}

function appendProfileViewersSyncLog(
  state: ProfileViewersSyncState,
  log: ProfileViewersSyncLog
): ProfileViewersSyncState {
  return {
    ...state,
    logs: [log, ...state.logs].slice(0, PROFILE_VIEWERS_SYNC_LOG_LIMIT),
  };
}

function getProfileViewersSyncSkipReason(
  state: ProfileViewersSyncState,
  now: number
): string {
  if (!canMakeProfileViewersRequest(state, now)) {
    return 'request_rate_limit';
  }

  if (state.cooldownUntil && now < state.cooldownUntil) {
    return 'cooldown';
  }

  if (state.retryAt && now < state.retryAt) {
    return 'retry_not_due';
  }

  if (state.nextDueAt && now < state.nextDueAt) {
    return 'next_run_not_due';
  }

  return 'decision_blocked';
}

async function notifyLinkedInTabsAboutProfileViewersSync(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) =>
        chrome.tabs.sendMessage(tab.id, { type: 'PROFILE_VIEWERS_SYNC_COMPLETED' }).catch(() => {
          /* the sidebar content script may not be ready in every LinkedIn tab */
        })
      )
  );
}

async function runProfileViewersSyncCoordinator(
  trigger: ProfileViewersSyncTrigger,
  force = false
): Promise<ProfileViewersSyncCoordinatorResult> {
  await appendProfileViewersWakeEvent({
    event: 'coordinator_started',
    trigger,
    reason: force ? 'forced' : 'scheduled',
  });

  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    const now = Date.now();
    const [authContext, storedState] = await Promise.all([
      getStoredFeedsAuthContext(),
      getStoredProfileViewersSyncState(),
    ]);
    const recoveryState =
      authContext.userId && storedState?.userId !== authContext.userId
        ? createProfileViewersSyncState(authContext.userId, now)
        : storedState;
    const authRecoveryPlan = getProfileViewersAuthRecoveryPlan({
      now,
      nextDueAt: recoveryState?.nextDueAt,
      previousAttempts: recoveryState?.authRecoveryAttempts || 0,
      hasAuthHint: authContext.hasStoredUser || authContext.hasStoredTokens,
    });

    if (authRecoveryPlan.action === 'clear_alarm') {
      await setProfileViewersAuthRecoveryState(recoveryState, 0);
      await clearProfileViewersAlarm('app_auth_absent');
      await appendProfileViewersWakeEvent({
        event: 'auth_absent_alarm_cleared',
        trigger,
        reason: authRecoveryPlan.reason,
        hasStoredUser: authContext.hasStoredUser,
        hasStoredTokens: authContext.hasStoredTokens,
      });
    } else {
      await setProfileViewersAuthRecoveryState(
        recoveryState,
        authRecoveryPlan.attempts,
        authRecoveryPlan.scheduledAt
      );
      await scheduleProfileViewersAlarmAt(
        authRecoveryPlan.scheduledAt,
        authRecoveryPlan.reason
      );
      await appendProfileViewersWakeEvent({
        event:
          authRecoveryPlan.reason === 'preserve_next_due'
            ? 'auth_unavailable_alarm_preserved'
            : 'auth_unavailable_retry_scheduled',
        trigger,
        reason: authRecoveryPlan.reason,
        scheduledAt: authRecoveryPlan.scheduledAt,
        nextDueAt: recoveryState?.nextDueAt,
        hasStoredUser: authContext.hasStoredUser,
        hasStoredTokens: authContext.hasStoredTokens,
        authRecoveryAttempts: authRecoveryPlan.attempts,
      });
    }

    return {
      ran: false,
      success: false,
      error: 'myFeedPilot authentication is required before profile visitors can be synchronized.',
    };
  }

  let state = await getProfileViewersSyncState(user.uid);
  const hadAuthRecoveryState = state.authRecoveryAttempts > 0 || Boolean(state.authRecoveryAt);
  if (hadAuthRecoveryState) {
    state = {
      ...state,
      authRecoveryAttempts: 0,
      authRecoveryAt: undefined,
      updatedAt: Date.now(),
    };
  }

  const decisionAt = Date.now();
  const decision = decideProfileViewersSync(state, decisionAt, trigger, force);
  if (!decision.shouldRun || !decision.attemptNumber || !decision.runType) {
    if (hadAuthRecoveryState) {
      await setProfileViewersSyncState(state);
    }
    await scheduleNextProfileViewersAlarm(state);
    await appendProfileViewersWakeEvent({
      event: 'sync_skipped',
      trigger,
      reason: getProfileViewersSyncSkipReason(state, decisionAt),
      nextDueAt: getNextProfileViewersAlarmAt(state) || undefined,
    });
    return { ran: false, success: true };
  }

  const startedAt = Date.now();
  const attemptNumber = decision.attemptNumber;
  const runType: ProfileViewersSyncRunType = decision.runType;
  const attemptIntervalMs = getProfileViewersScheduledIntervalMs();
  await appendProfileViewersWakeEvent({
    event: 'sync_started',
    trigger,
    reason: runType,
    nextDueAt: state.nextDueAt,
  });
  state = startProfileViewersSyncAttempt(state, startedAt, attemptNumber, attemptIntervalMs);
  await setProfileViewersSyncState(state);
  await scheduleNextProfileViewersAlarm(state).catch((error) => {
    console.warn('[profile-viewers-sync] Failed to schedule attempt recovery alarm:', error);
  });

  try {
    const result = await syncProfileViewersViaApi(
      user,
      state,
      async (progressState) => {
        state = progressState;
        await setProfileViewersSyncState(state);
      },
      {
        ignoreRequestBudget: force,
        pruneStaleAfterComplete: force && trigger === 'manual',
      }
    );
    const finishedAt = Date.now();
    const scheduledIntervalMs = getProfileViewersScheduledIntervalMs();
    state = completeProfileViewersSyncSuccess(state, finishedAt, scheduledIntervalMs);
    const log: ProfileViewersSyncLog = {
      id: `${startedAt}-${attemptNumber}`,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      trigger,
      runType,
      attemptNumber,
      status: getProfileViewersSyncLogStatus(
        undefined,
        result.newCount + (result.newSearchCount || 0)
      ),
      httpStatus: result.httpStatus,
      responseLength: result.responseLength,
      requestCount: result.requestCount,
      pagesFetched: result.pagesFetched,
      paginationComplete: result.paginationComplete,
      paginationMode: result.paginationMode,
      backfillStatus: state.backfillStatus,
      visibleCount: result.visibleCount,
      visibleSearchCount: result.visibleSearchCount,
      privateViewerCount: result.privateViewerCount,
      recruiterViewerCount: result.recruiterViewerCount,
      recruiterViewerUrl: result.recruiterViewerUrl,
      savedCount: result.savedCount,
      searchSavedCount: result.searchSavedCount,
      newCount: result.newCount,
      newSearchCount: result.newSearchCount,
      updatedCount: result.updatedCount,
      visibleProfileUsernames: result.visibleProfileUsernames.slice(
        0,
        PROFILE_VIEWERS_SYNC_LOG_USERNAME_LIMIT
      ),
      newProfileUsernames: result.newProfileUsernames.slice(
        0,
        PROFILE_VIEWERS_SYNC_LOG_USERNAME_LIMIT
      ),
      recoveredFromInterruptedAttempt: decision.recoveredFromInterruptedAttempt,
      requestCountInWindow: state.requestCountInWindow,
      rateLimitResetAt: getProfileViewersRateLimitResetAt(state),
      scheduledIntervalMs,
      consecutiveFailedCycles: state.consecutiveFailedCycles,
      nextScheduledAt: state.nextDueAt || finishedAt,
    };
    state = appendProfileViewersSyncLog(state, log);
    await setProfileViewersSyncState(state);
    await scheduleNextProfileViewersAlarm(state);
    await queueProfileViewersStatusSync({
      trigger: 'profile_viewers_sync',
      priorityUsernames: result.newProfileUsernames,
      urgent:
        trigger === 'manual' ||
        (result.paginationMode === 'incremental' && result.newProfileUsernames.length > 0),
    }).catch((error) => {
      console.warn('[profile-viewers-sync] Failed to queue profile viewer status sync:', error);
    });
    await notifyLinkedInTabsAboutProfileViewersSync().catch((error) => {
      console.warn('[profile-viewers-sync] Failed to notify LinkedIn tabs:', error);
    });
    await appendProfileViewersWakeEvent({
      event: 'sync_completed',
      trigger,
      reason: log.status,
      nextDueAt: log.nextScheduledAt,
      success: true,
    });
    console.info('[profile-viewers-sync]', log);
    return { ran: true, success: true, result };
  } catch (error) {
    const finishedAt = Date.now();
    const syncError = getProfileViewersSyncError(error);
    state = completeProfileViewersSyncFailure(state, finishedAt, attemptNumber, syncError);
    const log: ProfileViewersSyncLog = {
      id: `${startedAt}-${attemptNumber}`,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      trigger,
      runType,
      attemptNumber,
      status: getProfileViewersSyncLogStatus(syncError.code),
      httpStatus: syncError.httpStatus,
      visibleCount: 0,
      savedCount: 0,
      newCount: 0,
      updatedCount: 0,
      visibleProfileUsernames: [],
      newProfileUsernames: [],
      recoveredFromInterruptedAttempt: decision.recoveredFromInterruptedAttempt,
      requestCountInWindow: state.requestCountInWindow,
      rateLimitResetAt: getProfileViewersRateLimitResetAt(state),
      consecutiveFailedCycles: state.consecutiveFailedCycles,
      cooldownUntil: state.cooldownUntil,
      backfillStatus: state.backfillStatus,
      errorCode: syncError.code,
      errorMessage: syncError.message,
      nextScheduledAt: getNextProfileViewersAlarmAt(state) || state.nextDueAt || finishedAt,
    };
    state = appendProfileViewersSyncLog(state, log);
    await setProfileViewersSyncState(state);
    await scheduleNextProfileViewersAlarm(state);
    await appendProfileViewersWakeEvent({
      event: 'sync_failed',
      trigger,
      reason: syncError.code,
      nextDueAt: log.nextScheduledAt,
      success: false,
      error: syncError.message,
    });
    console.warn('[profile-viewers-sync]', log);
    return {
      ran: true,
      success: false,
      error: syncError.message,
    };
  }
}

export function queueProfileViewersSync(
  trigger: ProfileViewersSyncTrigger,
  force = false
): Promise<ProfileViewersSyncCoordinatorResult> {
  if (profileViewersSyncCoordinatorPromise) {
    return profileViewersSyncCoordinatorPromise.then(() => queueProfileViewersSync(trigger, force));
  }

  const coordinatorPromise = runProfileViewersSyncCoordinator(trigger, force).finally(() => {
    if (profileViewersSyncCoordinatorPromise === coordinatorPromise) {
      profileViewersSyncCoordinatorPromise = null;
    }
  });
  profileViewersSyncCoordinatorPromise = coordinatorPromise;
  return coordinatorPromise;
}
