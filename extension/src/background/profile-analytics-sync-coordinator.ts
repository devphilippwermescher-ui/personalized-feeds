import { getProfileAnalyticsSnapshot } from 'shared/firestore-service';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { syncConnectionHistoryFromLinkedIn, syncProfileAnalyticsFromLinkedInTabs } from './profile-analytics-sync';
import {
  isCurrentProfileAnalyticsRetryBlocked,
  isConnectionHistoryDue,
  isCurrentProfileAnalyticsDue,
  isSocialSellingIndexDue,
  isSocialSellingIndexRetryBlocked,
  mustVerifyCurrentProfileAnalytics,
  PROFILE_ANALYTICS_HISTORY_START_DELAY_MS,
  PROFILE_ANALYTICS_HISTORY_RETRY_DELAY_MS,
  PROFILE_ANALYTICS_RETRY_DELAY_MS,
  PROFILE_ANALYTICS_RESTRICTION_RETRY_MS,
  SOCIAL_SELLING_INDEX_SYNC_TTL_MS,
  PROFILE_ANALYTICS_SYNC_INTERVAL_MS,
  selectPendingProfileAnalyticsRequest,
  type ProfileAnalyticsSyncRequest,
  type ProfileAnalyticsSyncState,
  type ProfileAnalyticsSyncTrigger,
} from './profile-analytics-sync-policy';
import { syncSocialSellingIndexMetric } from './profile-analytics-ssi-sync';

// Versioned so existing installations run the request-based SSI collector once
// immediately after upgrading instead of trusting an older Firestore timestamp.
const PROFILE_ANALYTICS_SYNC_STORAGE_KEY = 'mfp_profile_analytics_sync_v4';
export const PROFILE_ANALYTICS_ALARM_NAME = 'profile-analytics-sync-v1';

export type { ProfileAnalyticsSyncTrigger } from './profile-analytics-sync-policy';

export interface ProfileAnalyticsSyncResult {
  ran: boolean;
  success: boolean;
  currentSynced: boolean;
  historySynced: boolean;
  reason: 'fresh' | 'no_auth' | 'no_linkedin_tab' | 'synced' | 'failed';
  error?: string;
}

let activeSync: Promise<ProfileAnalyticsSyncResult> | null = null;
let activeSyncRequest: ProfileAnalyticsSyncRequest | null = null;
let pendingSyncRequest: ProfileAnalyticsSyncRequest | null = null;
const observedLinkedInTabIds = new Set<number>();

function isRestrictionSignal(error: unknown): boolean {
  const status = (error as { httpStatus?: unknown })?.httpStatus;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    status === 429 ||
    status === 999 ||
    message.includes('blocked with 429') ||
    message.includes('blocked with 999') ||
    message.includes('temporarily restricted')
  );
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
  const availableLinkedInTabs = linkedInTabs.filter(
    (tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number'
  );
  if (availableLinkedInTabs.length === 0) {
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
  let ssiSynced = false;
  const currentRetryBlocked = isCurrentProfileAnalyticsRetryBlocked({ now: startedAt, state, trigger });
  const ssiRetryBlocked = isSocialSellingIndexRetryBlocked({ now: startedAt, state, trigger });
  const preferredLinkedInTab = availableLinkedInTabs.find((tab) => tab.id === preferredTabId);
  const activeLinkedInTab =
    preferredLinkedInTab || availableLinkedInTabs.find((tab) => tab.active) || availableLinkedInTabs[0];

  if (
    !ssiRetryBlocked &&
    (mustVerifyCurrentProfileAnalytics(trigger) || isSocialSellingIndexDue({ now: startedAt, state }))
  ) {
    state = {
      ...state,
      userId: user.uid,
      ssiLastAttemptAt: startedAt,
      ssiNextRetryAt: undefined,
      ssiLastError: undefined,
      ssiRetryKind: undefined,
    };
    await setStoredState(state);

    const ssiResult = await syncSocialSellingIndexMetric({
      userId: user.uid,
      trigger,
      linkedInTabId: activeLinkedInTab.id,
      currentSnapshot: snapshot,
      collectedAt: startedAt,
    });
    snapshot = ssiResult.snapshot || snapshot;
    if (ssiResult.collected) {
      ssiSynced = true;
      state = {
        ...state,
        userId: user.uid,
        ssiLastSuccessAt: Date.now(),
        ssiNextRetryAt: undefined,
        ssiLastError: undefined,
        ssiRetryKind: undefined,
      };
    } else {
      const restricted = isRestrictionSignal(ssiResult.error);
      state = {
        ...state,
        userId: user.uid,
        ssiNextRetryAt:
          Date.now() + (restricted ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS),
        ssiLastError: ssiResult.error,
        ssiRetryKind: restricted ? 'restriction' : 'standard',
      };
    }
    await setStoredState(state);
  }

  if (
    !currentRetryBlocked &&
    (mustVerifyCurrentProfileAnalytics(trigger) || isCurrentProfileAnalyticsDue({ now: startedAt, state }))
  ) {
    state = {
      ...state,
      userId: user.uid,
      lastAttemptAt: startedAt,
      nextRetryAt: undefined,
      lastError: undefined,
      retryKind: undefined,
    };
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
        retryKind: undefined,
      };
      await setStoredState(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextRetryAt =
        Date.now() +
        (isRestrictionSignal(error) ? PROFILE_ANALYTICS_RESTRICTION_RETRY_MS : PROFILE_ANALYTICS_RETRY_DELAY_MS);
      state = {
        ...state,
        userId: user.uid,
        nextRetryAt,
        lastError: message,
        retryKind: isRestrictionSignal(error) ? 'restriction' : 'standard',
      };
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
  const nextSsiAt =
    state?.ssiNextRetryAt || (state?.ssiLastSuccessAt || Date.now()) + SOCIAL_SELLING_INDEX_SYNC_TTL_MS;
  const nextAlarmAt = Math.min(
    nextCurrentAt,
    nextSsiAt,
    state?.historyNextRetryAt || Number.POSITIVE_INFINITY
  );
  await scheduleAlarm(Number.isFinite(nextAlarmAt) ? nextAlarmAt : nextCurrentAt);

  return {
    ran: currentSynced || historySynced || ssiSynced,
    success: true,
    currentSynced,
    historySynced,
    reason: currentSynced || historySynced || ssiSynced ? 'synced' : 'fresh',
  };
}

/** Deduplicates only Profile Analytics work; other extension domains keep running independently. */
export function queueProfileAnalyticsSync(
  trigger: ProfileAnalyticsSyncTrigger,
  preferredTabId?: number
): Promise<ProfileAnalyticsSyncResult> {
  const request: ProfileAnalyticsSyncRequest = { trigger, preferredTabId };
  if (activeSync && activeSyncRequest) {
    pendingSyncRequest = selectPendingProfileAnalyticsRequest(activeSyncRequest, pendingSyncRequest, request);
    return activeSync;
  }

  activeSyncRequest = request;
  activeSync = runProfileAnalyticsSync(trigger, preferredTabId).finally(() => {
    activeSync = null;
    activeSyncRequest = null;
    const followUpRequest = pendingSyncRequest;
    pendingSyncRequest = null;
    if (followUpRequest) {
      void queueProfileAnalyticsSync(followUpRequest.trigger, followUpRequest.preferredTabId);
    }
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
