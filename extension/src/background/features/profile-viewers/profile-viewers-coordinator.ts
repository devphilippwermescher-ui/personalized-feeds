import { getAuthenticatedFeedsUser, getStoredFeedsAuthContext } from '../auth/services/authenticated-user';
import {
  getActiveLinkedInHeavySyncLock,
  releaseConnectionHistorySyncLock,
} from '../../platform/linkedin/heavy-sync-lock';
import { getUserPlanSnapshot } from '../billing/services/plan-service';
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
import {
  getProfileViewersSyncSkipReason,
  notifyLinkedInTabsAboutProfileViewersSync,
} from './profile-viewers-coordinator-runtime';
import { executeProfileViewersSyncAttempt } from './profile-viewers-sync-runner';
import {
  canMakeProfileViewersRequest,
  createProfileViewersSyncState,
  decideProfileViewersSync,
  getNextProfileViewersAlarmAt,
  getProfileViewersAuthRecoveryPlan,
  getProfileViewersScheduledIntervalMs,
  isProfileViewersFirstSurfaceReady,
  prepareProfileViewersStateForPlan,
  startProfileViewersSyncAttempt,
  type ProfileViewersSyncRunType,
  type ProfileViewersSyncTrigger,
} from './profile-viewers-sync-state';

let profileViewersSyncCoordinatorPromise: Promise<ProfileViewersSyncCoordinatorResult> | null = null;

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
    if (hadAuthRecoveryState) await setProfileViewersSyncState(state);
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
  await appendProfileViewersWakeEvent({
    event: 'sync_started',
    trigger,
    reason: runType,
    nextDueAt: state.nextDueAt,
  });
  state = startProfileViewersSyncAttempt(state, startedAt, attemptNumber, getProfileViewersScheduledIntervalMs());
  await setProfileViewersSyncState(state);
  await scheduleNextProfileViewersAlarm(state).catch((error) => {
    console.warn('[profile-viewers-sync] Failed to schedule attempt recovery alarm:', error);
  });

  const collectionTask =
    planSnapshot.entitlements.collectPrivateProfileViewers &&
    state.backfillStatus === 'complete' &&
    state.nextCollectionTask === 'private_summary'
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
    syncProgress: { phase: collectionTask, startedAt },
  }).catch((error) => {
    console.warn('[profile-viewers-sync] Failed to notify LinkedIn tabs about collection start:', error);
  });

  return executeProfileViewersSyncAttempt({
    user,
    planSnapshot,
    initialState: state,
    decision,
    trigger,
    startedAt,
    attemptNumber,
    runType,
    collectionTask,
    force,
  });
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
  if (!user) return queueProfileViewersSync(trigger);

  let state = await getProfileViewersSyncState(user.uid);
  const firstSurfaceIncomplete = !isProfileViewersFirstSurfaceReady(state);
  const forceFirstSurface =
    firstSurfaceIncomplete && (trigger === 'install' || trigger === 'sign_in' || trigger === 'linkedin_activity');
  let result = await queueProfileViewersSync(trigger, forceFirstSurface);
  if (!result.success) return result;

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
