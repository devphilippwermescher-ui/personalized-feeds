import { PROFILE_ANALYTICS_CONNECTION_HISTORY_VERSION } from 'shared/firestore-service';
import type {
  ProfileAnalyticsConnectionHistoryBootstrap,
  ProfileAnalyticsConnectionHistoryJob,
  ProfileAnalyticsSnapshot,
} from 'shared/types';

export const CONNECTION_HISTORY_AGGRESSIVE_BATCH_PAGE_LIMIT = 20;
export const CONNECTION_HISTORY_CAUTIOUS_BATCH_PAGE_LIMIT = 10;
export const CONNECTION_HISTORY_AGGRESSIVE_PAGE_DELAY_MS = 1_125;
export const CONNECTION_HISTORY_CAUTIOUS_PAGE_DELAY_MS = 2_500;
export const CONNECTION_HISTORY_AUTOMATIC_RESTART_LIMIT = 1;
export const RECENT_CONNECTION_IDS_LIMIT = 100;

export interface ConnectionHistoryBatchResult {
  snapshot: ProfileAnalyticsSnapshot;
  job: ProfileAnalyticsConnectionHistoryJob;
  complete: boolean;
  error?: string;
}

export function createConnectionHistorySessionId(accountKey: string, now: number): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${now.toString(36)}_${random}_${accountKey.length.toString(36)}`;
}

export function toConnectionHistoryBootstrap(
  job: ProfileAnalyticsConnectionHistoryJob
): ProfileAnalyticsConnectionHistoryBootstrap {
  return {
    version: PROFILE_ANALYTICS_CONNECTION_HISTORY_VERSION,
    accountKey: job.accountKey,
    status: job.status,
    sessionId: job.sessionId,
    expectedTotal: job.expectedTotal,
    collectedCount: job.collectedCount,
    datedCount: job.datedCount,
    undatedCount: job.undatedCount,
    nextStartIndex: job.nextStartIndex,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    lastAttemptAt: job.lastAttemptAt,
    nextRetryAt: job.nextRetryAt,
    mode: job.mode,
    batchesSinceCooldown: job.batchesSinceCooldown,
    error: job.error,
  };
}
