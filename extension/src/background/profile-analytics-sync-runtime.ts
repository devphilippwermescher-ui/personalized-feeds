import type {
  ProfileAnalyticsSyncMetric,
  ProfileAnalyticsSyncMetricStatus,
  ProfileAnalyticsSyncStatus,
} from 'shared/types';
import {
  PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS,
  updateMetricStatus,
  type ProfileAnalyticsRetryKind,
  type ProfileAnalyticsSyncState,
  type ProfileAnalyticsSyncTrigger,
} from './profile-analytics-sync-policy';

const PROFILE_ANALYTICS_SYNC_STORAGE_KEY = 'mfp_profile_analytics_sync_v6';
const PROFILE_ANALYTICS_SYNC_LOG_LIMIT = 50;
export const PROFILE_ANALYTICS_ALARM_NAME = 'profile-analytics-sync-v1';

export interface ProfileAnalyticsFailureInfo {
  errorCode: string;
  message: string;
  technicalMessage: string;
  retryKind: ProfileAnalyticsRetryKind;
}

export function toIso(timestamp: number | undefined): string | undefined {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

export function classifyProfileAnalyticsFailure(error: unknown): ProfileAnalyticsFailureInfo {
  const technicalMessage = error instanceof Error ? error.message : String(error);
  const normalized = technicalMessage.toLowerCase();
  const status = (error as { httpStatus?: unknown })?.httpStatus;

  if (normalized.includes('no linkedin tab')) {
    return {
      errorCode: 'no_linkedin_tab',
      message: 'Open LinkedIn in another tab to refresh analytics.',
      technicalMessage,
      retryKind: 'standard',
    };
  }
  if (
    status === 429 ||
    status === 999 ||
    normalized.includes('blocked with 429') ||
    normalized.includes('blocked with 999')
  ) {
    return {
      errorCode: 'linkedin_restricted',
      message: 'LinkedIn temporarily limited analytics requests. Showing the last saved data.',
      technicalMessage,
      retryKind: 'restriction',
    };
  }
  if (
    status === 401 ||
    status === 403 ||
    normalized.includes('blocked with 401') ||
    normalized.includes('blocked with 403') ||
    normalized.includes('authentication token')
  ) {
    return {
      errorCode: 'linkedin_auth_required',
      message: 'The LinkedIn session could not be verified. Open LinkedIn and sign in to refresh analytics.',
      technicalMessage,
      retryKind: 'standard',
    };
  }
  if (normalized.includes('timed out') || normalized.includes('timeout') || normalized.includes('failed to fetch')) {
    return {
      errorCode: 'network_error',
      message: 'LinkedIn could not be reached. Showing the last saved data while we retry.',
      technicalMessage,
      retryKind: 'standard',
    };
  }
  if (normalized.includes('did not return') || normalized.includes('did not contain')) {
    return {
      errorCode: 'linkedin_response_missing_data',
      message: 'LinkedIn returned an incomplete analytics response. Showing the previous value.',
      technicalMessage,
      retryKind: 'standard',
    };
  }
  return {
    errorCode: 'sync_failed',
    message: 'Analytics could not be refreshed. Showing the last saved data while we retry.',
    technicalMessage,
    retryKind: 'standard',
  };
}

export function createProfileAnalyticsFailureStatus(error: unknown, retryAt: number): ProfileAnalyticsSyncMetricStatus {
  const failure = classifyProfileAnalyticsFailure(error);
  return {
    status: failure.retryKind === 'restriction' ? 'blocked' : 'failed',
    lastAttemptAt: Date.now(),
    nextRetryAt: retryAt,
    errorCode: failure.errorCode,
    message: failure.message,
    technicalMessage: failure.technicalMessage,
  };
}

export async function getStoredProfileAnalyticsSyncState(
  userId?: string
): Promise<ProfileAnalyticsSyncState | undefined> {
  const stored = await chrome.storage.local.get(PROFILE_ANALYTICS_SYNC_STORAGE_KEY);
  const state = stored[PROFILE_ANALYTICS_SYNC_STORAGE_KEY] as ProfileAnalyticsSyncState | undefined;
  return !userId || state?.userId === userId ? state : undefined;
}

export function setStoredProfileAnalyticsSyncState(state: ProfileAnalyticsSyncState): Promise<void> {
  return chrome.storage.local.set({ [PROFILE_ANALYTICS_SYNC_STORAGE_KEY]: state });
}

/** Clears per-metric `syncing` flags left behind when a service worker stops. */
export function recoverInterruptedProfileAnalyticsState(state: ProfileAnalyticsSyncState): ProfileAnalyticsSyncState {
  const historyWasRunning = state.historyAttemptInProgress === true || state.historyCheckpoint?.status === 'running';
  const metrics = Object.fromEntries(
    Object.entries(state.status.metrics).map(([metric, metricStatus]) => {
      if (metricStatus?.status !== 'syncing') return [metric, metricStatus];
      return [
        metric,
        {
          ...metricStatus,
          status: metricStatus.lastSuccessAt ? ('success' as const) : ('idle' as const),
          nextRetryAt: undefined,
          errorCode: undefined,
          message: undefined,
          technicalMessage: undefined,
        },
      ];
    })
  ) as ProfileAnalyticsSyncStatus['metrics'];

  return {
    ...state,
    version: 2,
    historyCheckpoint:
      state.historyCheckpoint?.status === 'running'
        ? { ...state.historyCheckpoint, status: 'pending' }
        : state.historyCheckpoint,
    historyNextRetryAt: historyWasRunning ? Date.now() + 1_000 : state.historyNextRetryAt,
    historyAttemptInProgress: false,
    attemptStartedAt: undefined,
    attemptExpiresAt: undefined,
    status: {
      ...state.status,
      status: 'idle',
      finishedAt: state.status.finishedAt || Date.now(),
      metrics,
    },
  };
}

export async function getProfileAnalyticsSyncStatus(): Promise<ProfileAnalyticsSyncStatus | null> {
  return (await getStoredProfileAnalyticsSyncState())?.status || null;
}

export async function scheduleProfileAnalyticsAlarm(scheduledAt: number, reason: string): Promise<void> {
  if (!chrome.alarms?.create) {
    console.info('[profile-analytics] alarm API unavailable', { reason });
    return;
  }

  const now = Date.now();
  const when = Math.max(now + 1_000, scheduledAt);
  await chrome.alarms.create(PROFILE_ANALYTICS_ALARM_NAME, { when });
  console.info('[profile-analytics] alarm scheduled', {
    alarmName: PROFILE_ANALYTICS_ALARM_NAME,
    reason,
    scheduledAt: when,
    scheduledAtIso: toIso(when),
    delayMs: when - now,
  });
}

export function markProfileAnalyticsMetricsRunning(
  state: ProfileAnalyticsSyncState,
  metrics: ProfileAnalyticsSyncMetric[],
  startedAt: number
): ProfileAnalyticsSyncState {
  return metrics.reduce(
    (next, metric) =>
      updateMetricStatus(next, metric, {
        status: 'syncing',
        lastAttemptAt: startedAt,
        nextRetryAt: undefined,
        errorCode: undefined,
        message: undefined,
        technicalMessage: undefined,
      }),
    state
  );
}

function deriveOverallStatus(state: ProfileAnalyticsSyncState): ProfileAnalyticsSyncStatus['status'] {
  const statuses = Object.values(state.status.metrics).map((metric) => metric?.status);
  if (statuses.includes('syncing')) return 'syncing';
  const failed = statuses.filter((status) => status === 'failed' || status === 'blocked');
  const succeeded = statuses.filter((status) => status === 'success');
  if (failed.length === 0) return succeeded.length > 0 ? 'success' : 'idle';
  if (succeeded.length > 0) return 'partial';
  return statuses.includes('blocked') ? 'blocked' : 'failed';
}

export function finishProfileAnalyticsSyncState(
  state: ProfileAnalyticsSyncState,
  trigger: ProfileAnalyticsSyncTrigger,
  startedAt: number,
  metrics: ProfileAnalyticsSyncMetric[],
  nextScheduledAt: number
): ProfileAnalyticsSyncState {
  const finishedAt = Date.now();
  const nextState: ProfileAnalyticsSyncState = {
    ...state,
    attemptStartedAt: undefined,
    attemptExpiresAt: undefined,
    nextScheduledAt,
    status: {
      ...state.status,
      status: deriveOverallStatus(state),
      trigger,
      startedAt,
      finishedAt,
      nextScheduledAt,
    },
  };
  return {
    ...nextState,
    logs: [
      { startedAt, finishedAt, trigger, status: nextState.status.status, metrics, nextScheduledAt },
      ...nextState.logs,
    ].slice(0, PROFILE_ANALYTICS_SYNC_LOG_LIMIT),
  };
}

export function getNextProfileAnalyticsAlarmAt(state: ProfileAnalyticsSyncState, now: number): number {
  const networkAt = state.networkNextRetryAt || state.networkNextDueAt || now;
  const searchAt =
    state.searchNextRetryAt || (state.searchLastSuccessAt || now) + PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS;
  const ssiAt = state.ssiNextRetryAt || (state.ssiLastSuccessAt || now) + PROFILE_ANALYTICS_DAILY_SYNC_INTERVAL_MS;
  return Math.min(
    networkAt,
    state.acceptanceNextDueAt || Number.POSITIVE_INFINITY,
    searchAt,
    ssiAt,
    state.metadataNextRetryAt || Number.POSITIVE_INFINITY,
    state.bootstrapNextRetryAt || Number.POSITIVE_INFINITY,
    state.historyNextRetryAt || Number.POSITIVE_INFINITY
  );
}
