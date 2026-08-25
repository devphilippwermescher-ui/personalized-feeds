import type { DashboardAnalyticsSourceStatus, DashboardAnalyticsSyncStatus } from 'shared/types';
import { CONTENT_ANALYTICS_ENABLED } from 'shared/feature-flags';
import {
  PROFILE_ANALYTICS_ALARM_NAME,
  getNextProfileAnalyticsAlarmAt,
  scheduleProfileAnalyticsAlarm,
  toIso,
} from '../profile-analytics-sync-runtime';
import {
  CONTENT_ANALYTICS_CORE_INTERVAL_MS,
  getContentAnalyticsState,
  type DashboardAnalyticsSyncState,
} from './dashboard-analytics-sync-policy';
import {
  classifyDashboardAnalyticsFailure,
  getDashboardAnalyticsErrorMessage,
  redactDiagnosticText,
  type DashboardAnalyticsErrorCode,
} from './dashboard-analytics-errors';
import { getStoredDashboardAnalyticsSyncState } from './dashboard-analytics-sync-storage';

/**
 * One alarm drives both analytics sources.
 *
 * The name is kept from the Profile Analytics era on purpose: renaming it
 * would leave the old alarm registered alongside a new one and double every
 * routine sync for already-installed users.
 */
export const DASHBOARD_ANALYTICS_ALARM_NAME = PROFILE_ANALYTICS_ALARM_NAME;

export { toIso } from '../profile-analytics-sync-runtime';

export function scheduleDashboardAnalyticsAlarm(scheduledAt: number, reason: string): Promise<void> {
  return scheduleProfileAnalyticsAlarm(scheduledAt, reason);
}

/** Local-only status the dashboard may poll; it never starts LinkedIn work. */
export async function getDashboardAnalyticsSyncStatus(): Promise<DashboardAnalyticsSyncStatus | null> {
  const state = await getStoredDashboardAnalyticsSyncState();
  if (!state) return null;
  const content = getContentAnalyticsState(state);
  const contentStatus: DashboardAnalyticsSourceStatus = content.lastErrorCode
    ? {
        status: content.retryKind === 'restriction' ? 'blocked' : 'failed',
        lastSuccessAt: content.lastSuccessAt,
        nextRetryAt: content.nextRetryAt,
        errorCode: content.lastErrorCode,
        message: getDashboardAnalyticsErrorMessage(content.lastErrorCode as DashboardAnalyticsErrorCode),
      }
    : content.lastSuccessAt
      ? { status: 'success', lastSuccessAt: content.lastSuccessAt, capturedAt: content.lastSuccessAt }
      : state.status.status === 'syncing'
        ? { status: 'syncing', capturedAt: state.status.startedAt }
        : { status: 'idle' };
  return { ...state.status, content: contentStatus };
}

export function createSyncRunId(now = Date.now(), randomValue = Math.random()): string {
  return `${now.toString(36)}_${randomValue.toString(36).slice(2, 10)}`;
}

export function toSourceStatusFromError(error: unknown, nextRetryAt?: number): DashboardAnalyticsSourceStatus {
  const failure = classifyDashboardAnalyticsFailure(error);
  return {
    status: failure.retryKind === 'restriction' ? 'blocked' : 'failed',
    nextRetryAt,
    errorCode: failure.errorCode,
    message: redactDiagnosticText(failure.message),
  };
}

export function getNextDashboardAnalyticsAlarmAt(state: DashboardAnalyticsSyncState, now: number): number {
  if (!CONTENT_ANALYTICS_ENABLED) {
    return getNextProfileAnalyticsAlarmAt(state, now);
  }

  const content = getContentAnalyticsState(state);
  const contentAt =
    content.nextRetryAt || content.nextDueAt || (content.lastSuccessAt || now) + CONTENT_ANALYTICS_CORE_INTERVAL_MS;
  const rangeAt = Object.values(content.ranges)
    .map((range) => range?.nextRetryAt || range?.nextDueAt)
    .filter((value): value is number => typeof value === 'number');
  const enrichmentAt = content.postEnrichment.nextDueAt;

  return Math.min(
    getNextProfileAnalyticsAlarmAt(state, now),
    contentAt,
    enrichmentAt || Number.POSITIVE_INFINITY,
    ...(rangeAt.length > 0 ? rangeAt : [Number.POSITIVE_INFINITY])
  );
}

export function logDashboardAnalyticsPlan(state: DashboardAnalyticsSyncState, nextScheduledAt: number): void {
  if (!CONTENT_ANALYTICS_ENABLED) {
    console.info('[dashboard-analytics] next checks planned', {
      contentAnalyticsEnabled: false,
      nextScheduledAt,
      nextScheduledAtIso: toIso(nextScheduledAt),
    });
    return;
  }

  const content = getContentAnalyticsState(state);
  console.info('[dashboard-analytics] next checks planned', {
    contentNextDueAt: content.nextRetryAt || content.nextDueAt,
    contentNextDueAtIso: toIso(content.nextRetryAt || content.nextDueAt),
    contentLastErrorCode: content.lastErrorCode,
    longRanges: Object.fromEntries(
      Object.entries(content.ranges).map(([key, range]) => [key, toIso(range?.nextDueAt)])
    ),
    postEnrichmentNextDueAt: toIso(content.postEnrichment.nextDueAt),
    nextScheduledAt,
    nextScheduledAtIso: toIso(nextScheduledAt),
  });
}
