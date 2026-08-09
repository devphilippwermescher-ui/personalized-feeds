import { getProfileAnalyticsSnapshot } from 'shared/firestore-service';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { syncConnectionHistoryFromLinkedIn, syncProfileAnalyticsFromLinkedInTabs } from './profile-analytics-sync';
import {
  isConnectionHistoryDue,
  isCurrentProfileAnalyticsDue,
  PROFILE_ANALYTICS_HISTORY_START_DELAY_MS,
  PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS,
  PROFILE_ANALYTICS_RETRY_DELAY_MS,
  PROFILE_ANALYTICS_RESTRICTION_RETRY_MS,
  PROFILE_ANALYTICS_SYNC_INTERVAL_MS,
  type ProfileAnalyticsSyncState,
} from './profile-analytics-sync-policy';

const PROFILE_ANALYTICS_SYNC_STORAGE_KEY = 'mfp_profile_analytics_sync_v2';
export const PROFILE_ANALYTICS_ALARM_NAME = 'profile-analytics-sync-v1';

export type ProfileAnalyticsSyncTrigger =
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'service_worker'
  | 'sign_in'
  | 'linkedin_open'
  | 'linkedin_activity'
  | 'alarm';

export interface ProfileAnalyticsSyncResult {
  ran: boolean;
  success: boolean;
  currentSynced: boolean;
  historySynced: boolean;
  reason: 'fresh' | 'no_auth' | 'no_linkedin_tab' | 'synced' | 'failed';
  error?: string;
}

let activeSync: Promise<ProfileAnalyticsSyncResult> | null = null;
const observedLinkedInTabIds = new Set<number>();

function mustVerifyCurrentValues(trigger: ProfileAnalyticsSyncTrigger): boolean {
  return trigger === 'install' || trigger === 'update' || trigger === 'sign_in' || trigger === 'linkedin_open';
}

function isRestrictionSignal(error: unknown): boolean {
  const status = (error as { httpStatus?: unknown })?.httpStatus;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return status === 429 || status === 999 || message.includes('temporarily restricted');
}

async function getStoredState(userId: string): Promise<ProfileAnalyticsSyncState | undefined> {
  const stored = await chrome.storage.local.get(PROFILE_ANALYTICS_SYNC_STORAGE_KEY);
  const state = stored[PROFILE_ANALYTICS_SYNC_STORAGE_KEY] as ProfileAnalyticsSyncState | undefined;
  return state?.userId === userId ? state : undefined;
}

function setStoredState(state: ProfileAnalyticsSyncState): Promise<void> {
  return chrome.storage.local.set({ [PROFILE_ANALYTICS_SYNC_STORAGE_KEY]: state });
}

function scheduleAlarm(scheduledAt: number): Promise<void> {
  if (!chrome.alarms?.create) return Promise.resolve();
  return chrome.alarms.create(PROFILE_ANALYTICS_ALARM_NAME, {
    when: Math.max(Date.now() + 1_000, scheduledAt),
  });
}

async function runProfileAnalyticsSync(
  trigger: ProfileAnalyticsSyncTrigger,
  preferredTabId?: number
): Promise<ProfileAnalyticsSyncResult> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    return { ran: false, success: false, currentSynced: false, historySynced: false, reason: 'no_auth' };
  }

  const linkedInTabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  if (!linkedInTabs.some((tab) => typeof tab.id === 'number')) {
    await scheduleAlarm(Date.now() + PROFILE_ANALYTICS_RETRY_DELAY_MS);
    return {
      ran: false,
      success: false,
      currentSynced: false,
      historySynced: false,
      reason: 'no_linkedin_tab',
    };
  }

  const startedAt = Date.now();
  let state = await getStoredState(user.uid);
  let snapshot = await getProfileAnalyticsSnapshot(user.uid);
  let currentSynced = false;
  let historySynced = false;
  const currentRetryBlocked = typeof state?.nextRetryAt === 'number' && startedAt < state.nextRetryAt;

  if (
    !currentRetryBlocked &&
    (mustVerifyCurrentValues(trigger) || isCurrentProfileAnalyticsDue({ now: startedAt, state }))
  ) {
    state = { ...state, userId: user.uid, lastAttemptAt: startedAt, nextRetryAt: undefined, lastError: undefined };
    await setStoredState(state);
    try {
      const currentResult = await syncProfileAnalyticsFromLinkedInTabs({
        preferredTabId,
        currentSnapshot: snapshot,
        forceCurrentMetrics: true,
      });
      snapshot = currentResult.snapshot;
      currentSynced = true;
      state = {
        ...state,
        userId: user.uid,
        lastSuccessAt: Date.now(),
        nextRetryAt: undefined,
        lastError: undefined,
      };
      await setStoredState(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextRetryAt =
        Date.now() +
        (isRestrictionSignal(error) ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS);
      state = { ...state, userId: user.uid, nextRetryAt, lastError: message };
      await setStoredState(state);
      await scheduleAlarm(nextRetryAt);
      console.warn('[profile-analytics] current snapshot failed', { trigger, error: message });
      return {
        ran: true,
        success: false,
        currentSynced: false,
        historySynced: false,
        reason: 'failed',
        error: message,
      };
    }
  }

  if (
    !currentRetryBlocked &&
    snapshot?.profile &&
    isConnectionHistoryDue({
      now: Date.now(),
      historyComplete: snapshot.profile.connectionDateCountsComplete === true,
      state,
    })
  ) {
    if (!state?.historyLastAttemptAt && trigger !== 'alarm') {
      state = {
        ...state,
        userId: user.uid,
        historyNextRetryAt: Date.now() + PROFILE_ANALYTICS_HISTORY_START_DELAY_MS,
      };
      await setStoredState(state);
    } else {
      const historyStartedAt = Date.now();
      state = {
        ...state,
        userId: user.uid,
        historyLastAttemptAt: historyStartedAt,
        historyNextRetryAt: undefined,
        historyLastError: undefined,
      };
      await setStoredState(state);
      try {
        snapshot = await syncConnectionHistoryFromLinkedIn(preferredTabId);
        historySynced = snapshot.profile?.connectionDateCountsComplete === true;
        state = {
          ...state,
          userId: user.uid,
          historyCompletedAt: historySynced ? Date.now() : undefined,
          historyNextRetryAt: historySynced ? undefined : Date.now() + PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS,
          historyLastError: historySynced ? undefined : snapshot.profile?.connectionDateCountsError,
        };
        await setStoredState(state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state = {
          ...state,
          userId: user.uid,
          historyNextRetryAt:
            Date.now() +
            (isRestrictionSignal(error)
              ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS
              : PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS),
          historyLastError: message,
        };
        await setStoredState(state);
        console.warn('[profile-analytics] connection history failed', { trigger, error: message });
      }
    }
  }

  const nextCurrentAt = state?.nextRetryAt || (state?.lastSuccessAt || Date.now()) + PROFILE_ANALYTICS_SYNC_INTERVAL_MS;
  const nextAlarmAt = Math.min(nextCurrentAt, state?.historyNextRetryAt || Number.POSITIVE_INFINITY);
  await scheduleAlarm(Number.isFinite(nextAlarmAt) ? nextAlarmAt : nextCurrentAt);

  return {
    ran: currentSynced || historySynced,
    success: true,
    currentSynced,
    historySynced,
    reason: currentSynced || historySynced ? 'synced' : 'fresh',
  };
}

/** Deduplicates only Profile Analytics work; other extension domains keep running independently. */
export function queueProfileAnalyticsSync(
  trigger: ProfileAnalyticsSyncTrigger,
  preferredTabId?: number
): Promise<ProfileAnalyticsSyncResult> {
  if (activeSync) return activeSync;
  activeSync = runProfileAnalyticsSync(trigger, preferredTabId).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export function queueProfileAnalyticsForLinkedInActivity(tabId?: number): Promise<ProfileAnalyticsSyncResult> {
  const firstActivityForLinkedInSession = typeof tabId === 'number' && observedLinkedInTabIds.size === 0;
  if (typeof tabId === 'number') observedLinkedInTabIds.add(tabId);
  return queueProfileAnalyticsSync(firstActivityForLinkedInSession ? 'linkedin_open' : 'linkedin_activity', tabId);
}

export function forgetProfileAnalyticsLinkedInTab(tabId: number): void {
  observedLinkedInTabIds.delete(tabId);
}
