import type { User } from 'firebase/auth';
import type { UserPlanSnapshot } from 'shared/plans';
import { recordProfileViewsAnalytics } from './profile-viewers-analytics';
import {
  appendProfileViewersWakeEvent,
  scheduleNextProfileViewersAlarm,
  setProfileViewersSyncState,
  type ProfileViewersSyncCoordinatorResult,
} from './profile-viewers-coordinator-storage';
import {
  appendProfileViewersSyncLog,
  getProfileViewersSyncError,
  getProfileViewersSyncLogStatus,
  mergeVisibleAndSummaryResults,
  notifyLinkedInTabsAboutProfileViewersSync,
} from './profile-viewers-coordinator-runtime';
import { syncPrivateProfileViewerSummaryViaApi } from './profile-viewers-private-summary-sync';
import type { ProfileViewersSyncResult } from './profile-viewers-sync-result';
import { syncProfileViewersViaApi } from './profile-viewers-sync-service';
import {
  canMakeProfileViewersRequest,
  completeProfileViewersSyncFailure,
  completeProfileViewersSyncSuccess,
  getIncompleteProfileViewersImportDueAt,
  getNextProfileViewersAlarmAt,
  getProfileViewersRequestBudget,
  getProfileViewersScheduledIntervalMs,
  isProfileViewersFirstSurfaceReady,
  PROFILE_VIEWERS_BACKGROUND_RESERVE,
  recordProfileViewersRequest,
  type ProfileViewersSyncDecision,
  type ProfileViewersSyncLog,
  type ProfileViewersSyncRunType,
  type ProfileViewersSyncState,
  type ProfileViewersSyncTrigger,
} from './profile-viewers-sync-state';
import { queueProfileViewersStatusSync } from './profile-viewers-status-sync';

const PROFILE_VIEWERS_SYNC_LOG_USERNAME_LIMIT = 50;

export async function executeProfileViewersSyncAttempt({
  user,
  planSnapshot,
  initialState,
  decision,
  trigger,
  startedAt,
  attemptNumber,
  runType,
  collectionTask,
  force,
}: {
  user: User;
  planSnapshot: UserPlanSnapshot;
  initialState: ProfileViewersSyncState;
  decision: ProfileViewersSyncDecision;
  trigger: ProfileViewersSyncTrigger;
  startedAt: number;
  attemptNumber: 1 | 2;
  runType: ProfileViewersSyncRunType;
  collectionTask: 'visible' | 'private_summary';
  force: boolean;
}): Promise<ProfileViewersSyncCoordinatorResult> {
  let state = initialState;

  try {
    const requestBudgetReserve = trigger === 'manual' ? PROFILE_VIEWERS_BACKGROUND_RESERVE : 0;
    const persistProgress = async (progressState: ProfileViewersSyncState) => {
      state = progressState;
      await setProfileViewersSyncState(state);
    };
    let result: ProfileViewersSyncResult;
    let ranVisibleTask = false;
    if (collectionTask === 'private_summary') {
      result = await syncPrivateProfileViewerSummaryViaApi(user, state, persistProgress, requestBudgetReserve);
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
