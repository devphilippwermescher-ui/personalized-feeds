import type { ProfileAnalyticsSnapshot } from 'shared/types';
import { setProfileAnalyticsConnectionHistoryJob } from 'shared/firestore-service';
import {
  CONNECTION_HISTORY_AGGRESSIVE_BATCH_PAGE_LIMIT,
  CONNECTION_HISTORY_AGGRESSIVE_PAGE_DELAY_MS,
  CONNECTION_HISTORY_CAUTIOUS_BATCH_PAGE_LIMIT,
  CONNECTION_HISTORY_CAUTIOUS_PAGE_DELAY_MS,
  ensureConnectionHistoryBootstrapJob,
  reconcileCompletedConnectionHistory,
  restartConnectionHistoryBootstrap,
  resumeConnectionHistoryBootstrap,
  syncConnectionHistoryBatch,
} from './profile-analytics-history-sync';
import {
  PROFILE_ANALYTICS_HISTORY_BATCH_DELAY_MS,
  PROFILE_ANALYTICS_HISTORY_COOLDOWN_BATCHES,
  PROFILE_ANALYTICS_HISTORY_COOLDOWN_MS,
  PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS,
  PROFILE_ANALYTICS_HISTORY_START_DELAY_MS,
  PROFILE_ANALYTICS_RESTRICTION_RETRY_MS,
  PROFILE_ANALYTICS_RETRY_DELAY_MS,
  type ProfileAnalyticsSyncState,
  type ProfileAnalyticsSyncTrigger,
} from './profile-analytics-sync-policy';
import { setStoredProfileAnalyticsSyncState } from './profile-analytics-sync-runtime';
import {
  acquireConnectionHistorySyncLock,
  releaseConnectionHistorySyncLock,
} from './linkedin-heavy-sync-lock';

function isLinkedInRestriction(error: unknown): boolean {
  const status = (error as { httpStatus?: unknown })?.httpStatus;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    status === 429 ||
    status === 999 ||
    message.includes(' 429') ||
    message.includes(' 999') ||
    message.includes('temporarily restricted') ||
    message.includes('rate limit')
  );
}

export async function runConnectionHistoryTask({
  state: initialState,
  snapshot: initialSnapshot,
  trigger,
  linkedInTabId,
}: {
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  trigger: ProfileAnalyticsSyncTrigger;
  linkedInTabId?: number;
}): Promise<{
  state: ProfileAnalyticsSyncState;
  snapshot: ProfileAnalyticsSnapshot | null;
  historySynced: boolean;
}> {
  if (!initialSnapshot?.profile) {
    return { state: initialState, snapshot: initialSnapshot, historySynced: false };
  }

  const state = { ...initialState };
  let snapshot = initialSnapshot;
  let historySynced = false;
  let job = await ensureConnectionHistoryBootstrapJob({
    userId: state.userId,
    profile: initialSnapshot.profile,
  });

  if (trigger === 'history_repair') {
    job = await restartConnectionHistoryBootstrap({ userId: state.userId, profile: initialSnapshot.profile });
    state.historyNextRetryAt = Date.now();
  } else if (trigger === 'history_resume' && job.status === 'needs_repair') {
    job = await resumeConnectionHistoryBootstrap({ userId: state.userId, profile: initialSnapshot.profile });
    state.historyNextRetryAt = Date.now();
  }

  if (job.status === 'complete') {
    if (
      snapshot.profile?.connectionHistoryBootstrap?.status !== 'complete' ||
      snapshot.profile.connectionDateCountsComplete !== true
    ) {
      snapshot = await reconcileCompletedConnectionHistory({
        userId: state.userId,
        currentSnapshot: snapshot,
        job,
      });
      historySynced = true;
    }
    await releaseConnectionHistorySyncLock(state.userId, job.accountKey);
    state.historyCompletedAt = job.completedAt || Date.now();
    state.historyNextRetryAt = undefined;
    state.historyLastError = undefined;
    state.historyCheckpoint = undefined;
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot, historySynced };
  }
  if (job.status === 'needs_repair') {
    await releaseConnectionHistorySyncLock(state.userId, job.accountKey);
    state.historyNextRetryAt = undefined;
    state.historyLastError = job.error;
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot, historySynced: false };
  }

  const firstSchedule =
    !job.lastAttemptAt && trigger !== 'alarm' && trigger !== 'history_repair' && trigger !== 'history_resume';
  if (firstSchedule) {
    await acquireConnectionHistorySyncLock({ userId: state.userId, accountKey: job.accountKey });
    state.historyNextRetryAt = Date.now() + PROFILE_ANALYTICS_HISTORY_START_DELAY_MS;
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot, historySynced: false };
  }
  if (
    state.historyNextRetryAt &&
    Date.now() < state.historyNextRetryAt &&
    trigger !== 'history_repair' &&
    trigger !== 'history_resume'
  ) {
    return { state, snapshot, historySynced: false };
  }
  if (typeof linkedInTabId !== 'number') {
    await releaseConnectionHistorySyncLock(state.userId, job.accountKey);
    state.historyNextRetryAt = Date.now() + PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS;
    state.historyLastError = 'No LinkedIn tab is open for the next connection-history batch.';
    await setStoredProfileAnalyticsSyncState(state);
    return { state, snapshot, historySynced: false };
  }

  state.historyLastAttemptAt = Date.now();
  state.historyNextRetryAt = undefined;
  state.historyAttemptInProgress = true;
  state.historyCheckpoint = undefined;
  await setStoredProfileAnalyticsSyncState(state);
  try {
    await acquireConnectionHistorySyncLock({ userId: state.userId, accountKey: job.accountKey });
    console.info('[profile-analytics] one-time connection history batch started', {
      linkedInTabId,
      accountKey: job.accountKey,
      sessionId: job.sessionId,
      nextStartIndex: job.nextStartIndex || 0,
      collectedCount: job.collectedCount || 0,
      mode: job.mode || 'aggressive',
      maxPages:
        job.mode === 'cautious'
          ? CONNECTION_HISTORY_CAUTIOUS_BATCH_PAGE_LIMIT
          : CONNECTION_HISTORY_AGGRESSIVE_BATCH_PAGE_LIMIT,
      pageDelayMs:
        job.mode === 'cautious'
          ? CONNECTION_HISTORY_CAUTIOUS_PAGE_DELAY_MS
          : CONNECTION_HISTORY_AGGRESSIVE_PAGE_DELAY_MS,
    });
    const batch = await syncConnectionHistoryBatch({
      userId: state.userId,
      linkedInTabId,
      currentSnapshot: snapshot,
      job,
    });
    snapshot = batch.snapshot;
    job = batch.job;
    historySynced = batch.complete;
    const restriction = Boolean(batch.error && isLinkedInRestriction(batch.error));
    const shouldCooldown =
      !batch.error &&
      job.mode !== 'cautious' &&
      (job.batchesSinceCooldown || 0) >= PROFILE_ANALYTICS_HISTORY_COOLDOWN_BATCHES;
    if (shouldCooldown) {
      job = { ...job, batchesSinceCooldown: 0, updatedAt: Date.now() };
      await setProfileAnalyticsConnectionHistoryJob(state.userId, job);
    }
    state.historyCompletedAt = historySynced ? job.completedAt || Date.now() : undefined;
    state.historyAttemptInProgress = false;
    state.historyNextRetryAt =
      job.status === 'needs_repair' || historySynced
        ? undefined
        : Date.now() +
          (restriction
            ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS
            : batch.error
              ? PROFILE_ANALYTICS_RETRY_DELAY_MS
              : shouldCooldown
                ? PROFILE_ANALYTICS_HISTORY_COOLDOWN_MS
                : PROFILE_ANALYTICS_HISTORY_BATCH_DELAY_MS);
    state.historyLastError = historySynced ? undefined : job.error;
    if (historySynced || job.status === 'needs_repair') {
      await releaseConnectionHistorySyncLock(state.userId, job.accountKey);
    } else {
      await acquireConnectionHistorySyncLock({
        userId: state.userId,
        accountKey: job.accountKey,
        ttlMs: restriction
          ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS + 60_000
          : batch.error
            ? PROFILE_ANALYTICS_RETRY_DELAY_MS + 60_000
            : undefined,
      });
    }
    console.info('[profile-analytics] one-time connection history batch finished', {
      status: job.status,
      historySynced,
      nextStartIndex: job.nextStartIndex,
      collectedCount: job.collectedCount,
      expectedTotal: job.expectedTotal,
      error: job.error,
      batchesSinceCooldown: job.batchesSinceCooldown,
      nextRetryAt: state.historyNextRetryAt,
      nextRetryAtIso: state.historyNextRetryAt
        ? new Date(state.historyNextRetryAt).toISOString()
        : undefined,
    });
  } catch (error) {
    const restriction = isLinkedInRestriction(error);
    job = {
      ...job,
      status: 'scheduled',
      mode: 'cautious',
      batchesSinceCooldown: 0,
      error: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    };
    await setProfileAnalyticsConnectionHistoryJob(state.userId, job);
    state.historyNextRetryAt =
      Date.now() + (restriction ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS);
    state.historyAttemptInProgress = false;
    state.historyLastError = job.error;
    console.warn('[profile-analytics] one-time connection history batch failed', {
      accountKey: job.accountKey,
      mode: job.mode,
      nextStartIndex: job.nextStartIndex,
      error: job.error,
      nextRetryAt: state.historyNextRetryAt,
      nextRetryAtIso: new Date(state.historyNextRetryAt).toISOString(),
    });
    await acquireConnectionHistorySyncLock({
      userId: state.userId,
      accountKey: job.accountKey,
      ttlMs:
        (restriction ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS) + 60_000,
    });
  }
  await setStoredProfileAnalyticsSyncState(state);
  return { state, snapshot, historySynced };
}
