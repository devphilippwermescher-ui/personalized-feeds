import {
  getProfileAnalyticsConnectionAccountKey,
  getProfileAnalyticsConnectionHistoryJob,
} from 'shared/firestore-service';
import type { ProfileAnalyticsConnectionHistoryJob, ProfileAnalyticsProfileSnapshot } from 'shared/types';
import { ensureConnectionHistoryBootstrapJob } from '../profile-analytics-history-sync';
import type { DashboardAnalyticsSyncTrigger } from './dashboard-analytics-sync-policy';

/**
 * The one-time Connections history backfill is expensive, so it is created
 * only when a signed-in person actually opens the extension UI for the first
 * time. Background wake-ups may continue a job that already exists, but a
 * Dashboard page is only a Firestore reader and never enters this flow.
 */
export const CONNECTION_HISTORY_BOOTSTRAP_TRIGGER: DashboardAnalyticsSyncTrigger = 'first_extension_entry';

export interface ConnectionHistoryBootstrapDecisionInput {
  trigger: DashboardAnalyticsSyncTrigger;
  hasAuthenticatedUser: boolean;
  accountKey: string | undefined;
  /** Firestore is the source of truth; cleared local storage must not matter. */
  persistedJobExists: boolean;
}

export function shouldCreateConnectionHistoryBootstrap({
  trigger,
  hasAuthenticatedUser,
  accountKey,
  persistedJobExists,
}: ConnectionHistoryBootstrapDecisionInput): boolean {
  return (
    trigger === CONNECTION_HISTORY_BOOTSTRAP_TRIGGER &&
    hasAuthenticatedUser &&
    Boolean(accountKey) &&
    !persistedJobExists
  );
}

export interface ConnectionHistoryJobAccess {
  job: ProfileAnalyticsConnectionHistoryJob | null;
  created: boolean;
  accountKey?: string;
}

/**
 * Resolves the account-scoped history job for this run.
 *
 * Returns an existing job for any trigger so a partially collected bootstrap
 * keeps resuming with its original session and checkpoint, and creates one
 * only for the first authenticated extension entry.
 */
export async function resolveConnectionHistoryJob({
  userId,
  profile,
  trigger,
  hasAuthenticatedUser = true,
  now = Date.now(),
}: {
  userId: string;
  profile: ProfileAnalyticsProfileSnapshot | undefined;
  trigger: DashboardAnalyticsSyncTrigger;
  hasAuthenticatedUser?: boolean;
  now?: number;
}): Promise<ConnectionHistoryJobAccess> {
  if (!profile) return { job: null, created: false };

  const accountKey = getProfileAnalyticsConnectionAccountKey(profile);
  if (!accountKey) return { job: null, created: false };

  const existing = await getProfileAnalyticsConnectionHistoryJob(userId, accountKey);
  if (existing) return { job: existing, created: false, accountKey };

  if (!shouldCreateConnectionHistoryBootstrap({
    trigger,
    hasAuthenticatedUser,
    accountKey,
    persistedJobExists: false,
  })) {
    return { job: null, created: false, accountKey };
  }

  const job = await ensureConnectionHistoryBootstrapJob({ userId, profile, now });
  console.info('[dashboard-analytics] one-time connection history bootstrap created', {
    trigger,
    accountKey,
    status: job.status,
    sessionId: job.sessionId,
  });
  return { job, created: true, accountKey };
}
