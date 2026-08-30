import {
  completeProfileViewersSyncFailure,
  completeProfileViewersSyncSuccess,
  canMakeProfileViewersRequest,
  createProfileViewersSyncState,
  decideProfileViewersSync,
  getIncompleteProfileViewersImportDueAt,
  getNextProfileViewersAlarmAt,
  getProfileViewersAuthRecoveryPlan,
  getProfileViewersRequestBudget,
  getProfileViewersScheduledIntervalMs,
  isProfileViewersFirstSurfaceReady,
  PROFILE_VIEWERS_BACKGROUND_RESERVE,
  prepareProfileViewersStateForPlan,
  recordProfileViewersRequest,
  startProfileViewersSyncAttempt,
  type ProfileViewersSyncErrorCode,
  type ProfileViewersSyncLog,
  type ProfileViewersSyncRunType,
  type ProfileViewersSyncState,
  type ProfileViewersSyncTrigger,
} from './profile-viewers-sync-state';
import { getAuthenticatedFeedsUser, getStoredFeedsAuthContext } from './feeds-auth';
import { ProfileViewersSyncError } from './profile-viewers-error';
import { syncProfileViewersViaApi } from './profile-viewers-sync-service';
import { syncPrivateProfileViewerSummaryViaApi } from './profile-viewers-private-summary-sync';
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
import { recordProfileViewsAnalytics } from './profile-viewers-analytics';
import type { ProfileViewersSyncResult } from './profile-viewers-sync-result';
import {
  getActiveLinkedInHeavySyncLock,
  releaseConnectionHistorySyncLock,
} from './linkedin-heavy-sync-lock';
import { getUserPlanSnapshot } from './subscription/plan-service';
import type { ProfileViewersCollectionProgress } from '../shared/profile-viewers-progress';

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

function mergeVisibleAndSummaryResults(
  visible: ProfileViewersSyncResult,
  summary: ProfileViewersSyncResult
): ProfileViewersSyncResult {
  return {
    ...visible,
    privateViewerCount: summary.privateViewerCount ?? visible.privateViewerCount,
    recruiterViewerCount: summary.recruiterViewerCount ?? visible.recruiterViewerCount,
    recruiterViewerUrl: summary.recruiterViewerUrl ?? visible.recruiterViewerUrl,
    httpStatus: summary.httpStatus ?? visible.httpStatus,
    responseLength: (visible.responseLength || 0) + (summary.responseLength || 0),
    requestCount: (visible.requestCount || 0) + (summary.requestCount || 0),
    pagesFetched: (visible.pagesFetched || 0) + (summary.pagesFetched || 0),
    paginationComplete: visible.paginationComplete && summary.paginationComplete,
    privateViewerCountStart: summary.privateViewerCountStart,
  };
}

function getProfileViewersSyncSkipReason(
  state: ProfileViewersSyncState,
  now: number,
  trigger: ProfileViewersSyncTrigger
): string {
  const reserveTokens =
    trigger === 'manual' ? PROFILE_VIEWERS_BACKGROUND_RESERVE : 0;
  if (!canMakeProfileViewersRequest(state, now, reserveTokens)) {
    return trigger === 'manual'
      ? 'request_budget_reserved_for_background'
      : 'request_budget_empty';
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

type ProfileViewersSyncNotification =
  | {
      type: 'PROFILE_VIEWERS_SYNC_STARTED';
      syncProgress: ProfileViewersCollectionProgress;
    }
  | { type: 'PROFILE_VIEWERS_SYNC_COMPLETED'; collectionFinished: true };

async function notifyLinkedInTabsAboutProfileViewersSync(
  message: ProfileViewersSyncNotification
): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) =>
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
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
      await setProfileViewersAuthRecoveryState(recoveryState, authRecoveryPlan.attempts, authRecoveryPlan.scheduledAt);
      await scheduleProfileViewersAlarmAt(authRecoveryPlan.scheduledAt, authRecoveryPlan.reason);
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

  const planSnapshot = await getUserPlanSnapshot(user.uid);
  let state = prepareProfileViewersStateForPlan(
    await getProfileViewersSyncState(user.uid),
    planSnapshot.plan,
    Date.now()
  );
  await setProfileViewersSyncState(state);
  const hadAuthRecoveryState = state.authRecoveryAttempts > 0 || Boolean(state.authRecoveryAt);
  if (hadAuthRecoveryState) {
    state = {
      ...state,
      authRecoveryAttempts: 0,
      authRecoveryAt: undefined,
      updatedAt: Date.now(),
    };
  }

  const heavySyncLock = await getActiveLinkedInHeavySyncLock(user.uid);
  if (heavySyncLock) {
    if (!isProfileViewersFirstSurfaceReady(state)) {
      // Old extension builds could create the Connections job before the
      // first Sidebar import completed. Recover those users by releasing the
      // stale priority inversion and finishing Profile Visitors first.
      await releaseConnectionHistorySyncLock(user.uid, heavySyncLock.accountKey);
      console.info('[profile-viewers-sync] released Connections history lock for incomplete Sidebar bootstrap', {
        trigger,
        accountKey: heavySyncLock.accountKey,
      });
    } else {
      const scheduledAt = heavySyncLock.expiresAt + 5_000;
      if (hadAuthRecoveryState) await setProfileViewersSyncState(state);
      await scheduleProfileViewersAlarmAt(scheduledAt, 'connections_history_bootstrap');
      await appendProfileViewersWakeEvent({
        event: 'sync_skipped',
        trigger,
        reason: 'connections_history_bootstrap',
        scheduledAt,
      });
      console.info('[profile-viewers-sync] deferred for Connections history bootstrap', {
        trigger,
        scheduledAt,
        accountKey: heavySyncLock.accountKey,
      });
      return { ran: false, success: true };
    }
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
      reason: getProfileViewersSyncSkipReason(state, decisionAt, trigger),
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

  const collectionTask =
    planSnapshot.entitlements.collectPrivateProfileViewers &&
    state.backfillStatus === 'complete' && state.nextCollectionTask === 'private_summary'
      ? 'private_summary'
      : 'visible';
  console.info('[profile-viewers-sync] collection task selected', {
    trigger,
    collectionTask,
    privateSummaryStatus: state.privateSummaryStatus,
    privateSummaryNextStart: state.privateSummaryNextStart,
    privateSummaryKnownStart: state.privateSummaryKnownStart,
  });
  await notifyLinkedInTabsAboutProfileViewersSync({
    type: 'PROFILE_VIEWERS_SYNC_STARTED',
    syncProgress: {
      phase: collectionTask,
      startedAt,
    },
  }).catch((error) => {
    console.warn('[profile-viewers-sync] Failed to notify LinkedIn tabs about collection start:', error);
  });

  try {
    const requestBudgetReserve =
      trigger === 'manual' ? PROFILE_VIEWERS_BACKGROUND_RESERVE : 0;
    const persistProgress = async (progressState: ProfileViewersSyncState) => {
      state = progressState;
      await setProfileViewersSyncState(state);
    };
    let result: ProfileViewersSyncResult;
    let ranVisibleTask = false;
    if (collectionTask === 'private_summary') {
      result = await syncPrivateProfileViewerSummaryViaApi(
        user,
        state,
        persistProgress,
        requestBudgetReserve
      );
    } else {
      ranVisibleTask = true;
      result = await syncProfileViewersViaApi(user, state, persistProgress, {
        requestBudgetReserve,
        pruneStaleAfterComplete: false,
        repairStoredIdentityMismatches: force && trigger === 'manual',
        collectionPlan: planSnapshot.plan,
        visibleViewerLimit: planSnapshot.entitlements.maxVisibleProfileViewers ?? undefined,
        collectPrivateSummary: planSnapshot.entitlements.collectPrivateProfileViewers,
      });

      // Every completed routine cycle refreshes both surfaces: first the
      // newest visible profiles, then the private/recruiter aggregate from its
      // persisted known position. The initial backfill uses the same hand-off
      // as soon as it reaches LinkedIn's end.
      if (
        planSnapshot.entitlements.collectPrivateProfileViewers &&
        state.backfillStatus === 'complete' &&
        state.nextCollectionTask === 'private_summary' &&
        canMakeProfileViewersRequest(state, Date.now(), requestBudgetReserve)
      ) {
        state = recordProfileViewersRequest(state, Date.now());
        await persistProgress(state);
        const summaryResult = await syncPrivateProfileViewerSummaryViaApi(
          user,
          state,
          persistProgress,
          requestBudgetReserve
        );
        result = mergeVisibleAndSummaryResults(result, summaryResult);
      }
    }
    const finishedAt = Date.now();
    const visibleViewerCount = ranVisibleTask ? result.visibleCount : undefined;
    await recordProfileViewsAnalytics({
      userId: user.uid,
      visibleCount: visibleViewerCount,
      privateCount: result.privateViewerCount,
      recruiterCount: result.recruiterViewerCount,
      updatedAt: finishedAt,
    }).catch((error) => {
      console.warn('[profile-viewers-sync] Failed to update profile analytics total:', error);
    });
    const scheduledIntervalMs = getProfileViewersScheduledIntervalMs();
    state = completeProfileViewersSyncSuccess(state, finishedAt, scheduledIntervalMs);
    let requestBudget = getProfileViewersRequestBudget(state, finishedAt);
    if (!isProfileViewersFirstSurfaceReady(state)) {
      state = {
        ...state,
        // Initial imports resume at the earliest request-safe moment instead
        // of falling into the normal 25-35 minute maintenance cadence.
        nextDueAt: getIncompleteProfileViewersImportDueAt(state, finishedAt),
        updatedAt: finishedAt,
      };
      requestBudget = getProfileViewersRequestBudget(state, finishedAt);
    }
    const log: ProfileViewersSyncLog = {
      id: `${startedAt}-${attemptNumber}`,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      trigger,
      runType,
      attemptNumber,
      status: getProfileViewersSyncLogStatus(undefined, result.newCount + (result.newSearchCount || 0)),
      httpStatus: result.httpStatus,
      responseLength: result.responseLength,
      requestCount: result.requestCount,
      pagesFetched: result.pagesFetched,
      paginationComplete: result.paginationComplete,
      paginationMode: result.paginationMode,
      collectionTask: result.collectionTask || collectionTask,
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
      visibleProfileUsernames: result.visibleProfileUsernames.slice(0, PROFILE_VIEWERS_SYNC_LOG_USERNAME_LIMIT),
      newProfileUsernames: result.newProfileUsernames.slice(0, PROFILE_VIEWERS_SYNC_LOG_USERNAME_LIMIT),
      recoveredFromInterruptedAttempt: decision.recoveredFromInterruptedAttempt,
      budgetTokensAvailable: requestBudget.tokensAvailable,
      budgetNextTokenAt: requestBudget.nextTokenAt,
      scheduledIntervalMs,
      consecutiveFailedCycles: state.consecutiveFailedCycles,
      nextScheduledAt: state.nextDueAt || finishedAt,
    };
    state = appendProfileViewersSyncLog(state, log);
    await setProfileViewersSyncState(state);
    await scheduleNextProfileViewersAlarm(state);
    if (ranVisibleTask) {
      await queueProfileViewersStatusSync({
        trigger: 'profile_viewers_sync',
        priorityUsernames: result.newProfileUsernames,
        urgent:
          trigger === 'manual' || (result.paginationMode === 'incremental' && result.newProfileUsernames.length > 0),
      }).catch((error) => {
        console.warn('[profile-viewers-sync] Failed to queue profile viewer status sync:', error);
      });
    }
    await notifyLinkedInTabsAboutProfileViewersSync({
      type: 'PROFILE_VIEWERS_SYNC_COMPLETED',
      collectionFinished: true,
    }).catch((error) => {
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
    const requestBudget = getProfileViewersRequestBudget(state, finishedAt);
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
      budgetTokensAvailable: requestBudget.tokensAvailable,
      budgetNextTokenAt: requestBudget.nextTokenAt,
      consecutiveFailedCycles: state.consecutiveFailedCycles,
      cooldownUntil: state.cooldownUntil,
      backfillStatus: state.backfillStatus,
      collectionTask,
      errorCode: syncError.code,
      errorMessage: syncError.message,
      nextScheduledAt: getNextProfileViewersAlarmAt(state) || state.nextDueAt || finishedAt,
    };
    state = appendProfileViewersSyncLog(state, log);
    await setProfileViewersSyncState(state);
    await scheduleNextProfileViewersAlarm(state);
    await notifyLinkedInTabsAboutProfileViewersSync({
      type: 'PROFILE_VIEWERS_SYNC_COMPLETED',
      collectionFinished: true,
    }).catch((notifyError) => {
      console.warn('[profile-viewers-sync] Failed to notify LinkedIn tabs about collection failure:', notifyError);
    });
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

export async function queueProfileViewersFirstSurfaceSync(
  trigger: ProfileViewersSyncTrigger
): Promise<ProfileViewersSyncCoordinatorResult> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    return queueProfileViewersSync(trigger);
  }

  let state = await getProfileViewersSyncState(user.uid);
  const firstSurfaceIncomplete = !isProfileViewersFirstSurfaceReady(state);
  const forceFirstSurface =
    firstSurfaceIncomplete &&
    (trigger === 'install' || trigger === 'sign_in' || trigger === 'linkedin_activity');
  let result = await queueProfileViewersSync(trigger, forceFirstSurface);
  if (!result.success) {
    return result;
  }

  state = await getProfileViewersSyncState(user.uid);
  const now = Date.now();
  const shouldCollectSummaryNow =
    result.ran &&
    state.backfillStatus === 'complete' &&
    state.privateSummaryStatus !== 'ready' &&
    canMakeProfileViewersRequest(state, now) &&
    (!state.cooldownUntil || state.cooldownUntil <= now);

  if (shouldCollectSummaryNow) {
    result = await queueProfileViewersSync(trigger, true);
  }

  return result;
}
