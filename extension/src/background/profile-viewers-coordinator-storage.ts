import {
  createProfileViewersSyncState,
  getNextProfileViewersAlarmAt,
  getProfileViewersSummaryMigrationDueAt,
  PROFILE_VIEWERS_BUDGET_CAPACITY,
  PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION,
  PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION,
  PROFILE_VIEWERS_VISIBLE_COLLECTION_VERSION,
  type ProfileViewersSyncState,
  type ProfileViewersSyncTrigger,
} from './profile-viewers-sync-state';
import {
  PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
  PROFILE_VIEWERS_RECENT_SNAPSHOT_LIMIT,
} from './profile-viewers-pagination';
import { getStorageValue, setStorageValue } from './feeds-auth';
import type { ProfileViewersSyncResult } from './profile-viewers-sync-result';

export const PROFILE_VIEWERS_ALARM_NAME = 'profile-viewers-sync';
const PROFILE_VIEWERS_SYNC_STORAGE_KEY = 'pf_profile_viewers_sync';
const PROFILE_VIEWERS_SYNC_LOG_LIMIT = 50;
const PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY = 'pf_profile_viewers_wake_events';
const PROFILE_VIEWERS_WAKE_LOG_LIMIT = 1000;
export interface ProfileViewersSyncCoordinatorResult {
  ran: boolean;
  success: boolean;
  result?: ProfileViewersSyncResult;
  error?: string;
}

type ProfileViewersWakeEventName =
  | 'worker_loaded'
  | 'runtime_installed'
  | 'chrome_startup'
  | 'alarm_received'
  | 'linkedin_activity'
  | 'sign_in'
  | 'coordinator_started'
  | 'auth_unavailable_alarm_preserved'
  | 'auth_unavailable_retry_scheduled'
  | 'auth_absent_alarm_cleared'
  | 'sync_skipped'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'alarm_scheduled'
  | 'alarm_cleared';

interface ProfileViewersWakeEvent {
  id: string;
  at: number;
  event: ProfileViewersWakeEventName;
  extensionId: string;
  trigger?: ProfileViewersSyncTrigger;
  reason?: string;
  scheduledAt?: number;
  nextDueAt?: number;
  hasStoredUser?: boolean;
  hasStoredTokens?: boolean;
  authRecoveryAttempts?: number;
  success?: boolean;
  error?: string;
}

let profileViewersWakeLogWritePromise: Promise<void> = Promise.resolve();

export function appendProfileViewersWakeEvent(
  event: Omit<ProfileViewersWakeEvent, 'id' | 'at' | 'extensionId'>
): Promise<void> {
  const at = Date.now();
  const wakeEvent: ProfileViewersWakeEvent = {
    ...event,
    id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    extensionId: chrome.runtime.id,
  };

  profileViewersWakeLogWritePromise = profileViewersWakeLogWritePromise
    .catch(() => {
      /* keep later diagnostic writes working after a storage failure */
    })
    .then(async () => {
      const stored = await getStorageValue<{
        [PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY]?: ProfileViewersWakeEvent[];
      }>(PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY);
      const events = Array.isArray(stored[PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY])
        ? stored[PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY]
        : [];

      await setStorageValue({
        [PROFILE_VIEWERS_WAKE_LOG_STORAGE_KEY]: [wakeEvent, ...events].slice(0, PROFILE_VIEWERS_WAKE_LOG_LIMIT),
      });
    })
    .catch((error) => {
      console.warn('[profile-viewers-sync] Failed to persist wake event:', error);
    });

  return profileViewersWakeLogWritePromise;
}

export async function getStoredProfileViewersSyncState(): Promise<Partial<ProfileViewersSyncState> | null> {
  const stored = await getStorageValue<{
    [PROFILE_VIEWERS_SYNC_STORAGE_KEY]?: Partial<ProfileViewersSyncState>;
  }>(PROFILE_VIEWERS_SYNC_STORAGE_KEY);
  const state = stored[PROFILE_VIEWERS_SYNC_STORAGE_KEY];
  return state?.version === 1 ? state : null;
}

export async function getProfileViewersSyncState(userId: string): Promise<ProfileViewersSyncState> {
  const now = Date.now();
  const state = await getStoredProfileViewersSyncState();

  if (!state || state.userId !== userId) {
    return createProfileViewersSyncState(userId, now);
  }

  const isCurrentSchedulePolicy =
    state.schedulePolicyVersion === PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION;
  const isCurrentSummaryCollection =
    state.summaryCollectionVersion === PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION;
  const isCurrentVisibleCollection =
    state.visibleCollectionVersion === PROFILE_VIEWERS_VISIBLE_COLLECTION_VERSION;
  const needsPrivateSummaryRescan =
    !isCurrentSummaryCollection && state.backfillStatus === 'complete';
  const migrationDueAt = getProfileViewersSummaryMigrationDueAt(state, now);

  return {
    ...createProfileViewersSyncState(userId, now),
    ...state,
    schedulePolicyVersion: PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION,
    summaryCollectionVersion: PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION,
    visibleCollectionVersion: PROFILE_VIEWERS_VISIBLE_COLLECTION_VERSION,
    nextDueAt:
      isCurrentSchedulePolicy && isCurrentVisibleCollection
        ? migrationDueAt
        : now,
    retryAt:
      isCurrentSchedulePolicy && isCurrentVisibleCollection
        ? state.retryAt
        : undefined,
    cooldownUntil:
      isCurrentSchedulePolicy && isCurrentVisibleCollection
        ? state.cooldownUntil
        : undefined,
    cycleStartedAt: isCurrentSchedulePolicy ? state.cycleStartedAt : undefined,
    attemptStartedAt: isCurrentSchedulePolicy ? state.attemptStartedAt : undefined,
    attemptExpiresAt: isCurrentSchedulePolicy ? state.attemptExpiresAt : undefined,
    requestWindowStartedAt: undefined,
    lastError: isCurrentSchedulePolicy ? state.lastError : undefined,
    requestCountInWindow: undefined,
    requestBudgetTokens:
      isCurrentSchedulePolicy &&
      typeof state.requestBudgetTokens === 'number' &&
      Number.isFinite(state.requestBudgetTokens)
        ? Math.min(
            PROFILE_VIEWERS_BUDGET_CAPACITY,
            Math.max(0, state.requestBudgetTokens)
          )
        : PROFILE_VIEWERS_BUDGET_CAPACITY,
    requestBudgetUpdatedAt:
      isCurrentSchedulePolicy &&
      typeof state.requestBudgetUpdatedAt === 'number' &&
      Number.isFinite(state.requestBudgetUpdatedAt)
        ? state.requestBudgetUpdatedAt
        : now,
    consecutiveFailedCycles:
      isCurrentSchedulePolicy && typeof state.consecutiveFailedCycles === 'number' && state.consecutiveFailedCycles >= 0
        ? state.consecutiveFailedCycles
        : 0,
    authRecoveryAttempts:
      typeof state.authRecoveryAttempts === 'number' && state.authRecoveryAttempts >= 0
        ? state.authRecoveryAttempts
        : 0,
    authRecoveryAt:
      typeof state.authRecoveryAt === 'number' && state.authRecoveryAt > 0 ? state.authRecoveryAt : undefined,
    backfillStatus:
      state.backfillStatus === 'in_progress' || state.backfillStatus === 'complete'
        ? state.backfillStatus
        : 'not_started',
    backfillPagesFetched:
      typeof state.backfillPagesFetched === 'number' && state.backfillPagesFetched >= 0
        ? state.backfillPagesFetched
        : 0,
    backfillProfilesSaved:
      typeof state.backfillProfilesSaved === 'number' && state.backfillProfilesSaved >= 0
        ? state.backfillProfilesSaved
        : 0,
    backfillNextStart:
      typeof state.backfillNextStart === 'number' && state.backfillNextStart >= 0 ? state.backfillNextStart : undefined,
    backfillPageSize:
      typeof state.backfillPageSize === 'number' && state.backfillPageSize > 0 ? state.backfillPageSize : undefined,
    recentProfileViewerUsernames: Array.isArray(state.recentProfileViewerUsernames)
      ? state.recentProfileViewerUsernames
          .filter((username): username is string => typeof username === 'string')
          .slice(0, PROFILE_VIEWERS_RECENT_SNAPSHOT_LIMIT)
      : [],
    // Run the newest visible page first so the same migration repairs both
    // rendered order and the private aggregate in one coordinator cycle.
    nextCollectionTask: needsPrivateSummaryRescan || !isCurrentVisibleCollection
      ? 'visible'
      : state.nextCollectionTask === 'private_summary'
        ? 'private_summary'
        : 'visible',
    privateSummaryStatus:
      needsPrivateSummaryRescan
        ? 'scanning'
        : state.privateSummaryStatus === 'scanning' || state.privateSummaryStatus === 'ready'
        ? state.privateSummaryStatus
        : 'not_started',
    privateSummaryNextStart:
      needsPrivateSummaryRescan
        ? PROFILE_VIEWERS_PAGINATION_PAGE_SIZE
        : typeof state.privateSummaryNextStart === 'number' && state.privateSummaryNextStart >= 0
        ? state.privateSummaryNextStart
        : undefined,
    privateSummaryPageSize:
      typeof state.privateSummaryPageSize === 'number' && state.privateSummaryPageSize > 0
        ? state.privateSummaryPageSize
        : undefined,
    privateSummaryKnownStart:
      !needsPrivateSummaryRescan &&
      typeof state.privateSummaryKnownStart === 'number' && state.privateSummaryKnownStart >= 0
        ? state.privateSummaryKnownStart
        : undefined,
    privateSummaryScanOrigin:
      needsPrivateSummaryRescan
        ? 'full'
        : state.privateSummaryScanOrigin === 'known_position'
        ? 'known_position'
        : state.privateSummaryScanOrigin === 'full'
          ? 'full'
          : undefined,
    privateSummaryLastAttemptAt:
      typeof state.privateSummaryLastAttemptAt === 'number' && state.privateSummaryLastAttemptAt > 0
        ? state.privateSummaryLastAttemptAt
        : undefined,
    privateSummaryLastSuccessAt:
      typeof state.privateSummaryLastSuccessAt === 'number' && state.privateSummaryLastSuccessAt > 0
        ? state.privateSummaryLastSuccessAt
        : undefined,
    attemptsInCycle:
      isCurrentSchedulePolicy && (state.attemptsInCycle === 1 || state.attemptsInCycle === 2)
        ? state.attemptsInCycle
        : 0,
    logs: Array.isArray(state.logs) ? state.logs.slice(0, PROFILE_VIEWERS_SYNC_LOG_LIMIT) : [],
  };
}

export async function setProfileViewersSyncState(state: ProfileViewersSyncState): Promise<void> {
  await setStorageValue({
    [PROFILE_VIEWERS_SYNC_STORAGE_KEY]: {
      ...state,
      logs: state.logs.slice(0, PROFILE_VIEWERS_SYNC_LOG_LIMIT),
    },
  });
}

export async function resetProfileViewersSyncState(userId: string): Promise<ProfileViewersSyncState> {
  const state = createProfileViewersSyncState(userId, Date.now());
  await setProfileViewersSyncState(state);
  return state;
}

export async function setProfileViewersAuthRecoveryState(
  state: Partial<ProfileViewersSyncState> | null,
  authRecoveryAttempts: number,
  authRecoveryAt?: number
): Promise<void> {
  if (!state) {
    return;
  }

  await setStorageValue({
    [PROFILE_VIEWERS_SYNC_STORAGE_KEY]: {
      ...state,
      authRecoveryAttempts,
      authRecoveryAt,
      updatedAt: Date.now(),
    },
  });
}

export async function clearProfileViewersAlarm(reason = 'no_next_run'): Promise<void> {
  if (!chrome.alarms?.clear) {
    return;
  }

  const cleared = await chrome.alarms.clear(PROFILE_VIEWERS_ALARM_NAME);
  await appendProfileViewersWakeEvent({
    event: 'alarm_cleared',
    reason: `${reason}:${cleared ? 'existing' : 'missing'}`,
  });
}

export async function scheduleProfileViewersAlarmAt(when: number, reason: string): Promise<void> {
  if (!chrome.alarms?.create) {
    return;
  }

  const scheduledAt = Math.max(when, Date.now() + 30_000);
  await chrome.alarms.create(PROFILE_VIEWERS_ALARM_NAME, { when: scheduledAt });
  await appendProfileViewersWakeEvent({
    event: 'alarm_scheduled',
    reason,
    scheduledAt,
  });
}

export async function scheduleNextProfileViewersAlarm(state: ProfileViewersSyncState): Promise<void> {
  const nextAlarmAt = getNextProfileViewersAlarmAt(state);
  if (!nextAlarmAt || !chrome.alarms?.create) {
    await clearProfileViewersAlarm('state_has_no_next_run');
    return;
  }

  await scheduleProfileViewersAlarmAt(nextAlarmAt, 'sync_state');
}
