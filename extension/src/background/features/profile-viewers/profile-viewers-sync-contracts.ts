import type { AppPlan } from 'shared/plans';

export const PROFILE_VIEWERS_SYNC_INTERVAL_MS = 30 * 60 * 1000;
export const PROFILE_VIEWERS_MIN_SYNC_INTERVAL_MS = 25 * 60 * 1000;
export const PROFILE_VIEWERS_MAX_SYNC_INTERVAL_MS = 35 * 60 * 1000;
export const PROFILE_VIEWERS_RETRY_DELAY_MS = 15 * 60 * 1000;
export const PROFILE_VIEWERS_RESTRICTED_BACKOFF_MS = 12 * 60 * 60 * 1000;
export const PROFILE_VIEWERS_FIRST_FAILURE_BACKOFF_MS = 60 * 60 * 1000;
export const PROFILE_VIEWERS_REPEATED_FAILURE_BACKOFF_MS = 2 * 60 * 60 * 1000;
export const PROFILE_VIEWERS_ATTEMPT_LEASE_MS = 5 * 60 * 1000;
export const PROFILE_VIEWERS_BUDGET_CAPACITY = 72;
export const PROFILE_VIEWERS_BUDGET_REFILL_MS = 20 * 60 * 1000;
export const PROFILE_VIEWERS_BACKGROUND_RESERVE = 8;
export const PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION = 3;
export const PROFILE_VIEWERS_SUMMARY_COLLECTION_VERSION = 4;
export const PROFILE_VIEWERS_VISIBLE_COLLECTION_VERSION = 3;
export const PROFILE_VIEWERS_AUTH_RECOVERY_DELAYS_MS = [
  2 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;

export type ProfileViewersSyncTrigger =
  | 'service_worker'
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'linkedin_activity'
  | 'sign_in'
  | 'alarm'
  | 'manual';

export type ProfileViewersSyncRunType = 'initial' | 'scheduled' | 'retry';
export type ProfileViewersBackfillStatus = 'not_started' | 'in_progress' | 'complete';
export type ProfileViewersCollectionTask = 'visible' | 'private_summary';
export type ProfileViewersPrivateSummaryStatus = 'not_started' | 'scanning' | 'ready';
export type ProfileViewersPrivateSummaryScanOrigin = 'full' | 'known_position';

export type ProfileViewersSyncErrorCode =
  | 'app_auth_required'
  | 'linkedin_auth_required'
  | 'network_error'
  | 'api_error'
  | 'parse_error'
  | 'unknown_error';

export interface ProfileViewersSyncErrorInfo {
  code: ProfileViewersSyncErrorCode;
  message: string;
  at: number;
  httpStatus?: number;
}

export interface ProfileViewersSyncLog {
  id: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  trigger: ProfileViewersSyncTrigger;
  runType: ProfileViewersSyncRunType;
  attemptNumber: 1 | 2;
  status: 'success' | 'no_changes' | 'auth_error' | 'network_error' | 'api_error' | 'parse_error' | 'unknown_error';
  httpStatus?: number;
  responseLength?: number;
  visibleCount: number;
  visibleSearchCount?: number;
  privateViewerCount?: number;
  recruiterViewerCount?: number;
  recruiterViewerUrl?: string;
  savedCount: number;
  searchSavedCount?: number;
  newCount: number;
  newSearchCount?: number;
  updatedCount: number;
  visibleProfileUsernames: string[];
  newProfileUsernames: string[];
  recoveredFromInterruptedAttempt?: boolean;
  budgetTokensAvailable?: number;
  budgetNextTokenAt?: number;
  /** @deprecated Fixed-window diagnostics retained only in legacy logs. */
  requestCountInWindow?: number;
  /** @deprecated Fixed-window diagnostics retained only in legacy logs. */
  rateLimitResetAt?: number;
  scheduledIntervalMs?: number;
  consecutiveFailedCycles?: number;
  cooldownUntil?: number;
  requestCount?: number;
  pagesFetched?: number;
  paginationComplete?: boolean;
  paginationMode?: 'backfill' | 'incremental';
  collectionTask?: ProfileViewersCollectionTask;
  backfillStatus?: ProfileViewersBackfillStatus;
  errorCode?: ProfileViewersSyncErrorCode;
  errorMessage?: string;
  nextScheduledAt: number;
}

export interface ProfileViewersSyncState {
  version: 1;
  schedulePolicyVersion: 2 | 3;
  summaryCollectionVersion: 2 | 3 | 4;
  visibleCollectionVersion: 1 | 2 | 3;
  userId: string;
  collectionPlan?: AppPlan;
  lastSuccessAt?: number;
  lastAttemptAt?: number;
  nextDueAt?: number;
  retryAt?: number;
  cycleStartedAt?: number;
  attemptStartedAt?: number;
  attemptExpiresAt?: number;
  cooldownUntil?: number;
  /** @deprecated Fixed-window state retained only while old local data migrates. */
  requestWindowStartedAt?: number;
  /** @deprecated Fixed-window state retained only while old local data migrates. */
  requestCountInWindow?: number;
  requestBudgetTokens: number;
  requestBudgetUpdatedAt: number;
  consecutiveFailedCycles: number;
  authRecoveryAttempts: number;
  authRecoveryAt?: number;
  backfillStatus: ProfileViewersBackfillStatus;
  backfillNextStart?: number;
  backfillPageSize?: number;
  backfillStartedAt?: number;
  backfillCompletedAt?: number;
  backfillPagesFetched: number;
  backfillProfilesSaved: number;
  recentProfileViewerUsernames: string[];
  nextCollectionTask: ProfileViewersCollectionTask;
  privateSummaryStatus: ProfileViewersPrivateSummaryStatus;
  privateSummaryNextStart?: number;
  privateSummaryPageSize?: number;
  privateSummaryKnownStart?: number;
  privateSummaryScanOrigin?: ProfileViewersPrivateSummaryScanOrigin;
  privateSummaryLastAttemptAt?: number;
  privateSummaryLastSuccessAt?: number;
  attemptsInCycle: 0 | 1 | 2;
  lastError?: ProfileViewersSyncErrorInfo;
  logs: ProfileViewersSyncLog[];
  updatedAt: number;
}

