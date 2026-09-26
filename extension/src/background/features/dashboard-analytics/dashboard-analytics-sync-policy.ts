import type { ContentAnalyticsRangeKey } from 'shared/types';
import {
  PROFILE_ANALYTICS_NETWORK_MAX_INTERVAL_MS,
  PROFILE_ANALYTICS_NETWORK_MIN_INTERVAL_MS,
  type ProfileAnalyticsRetryKind,
  type ProfileAnalyticsSyncState,
} from '../profile-analytics/profile-analytics-sync-policy';
import type { DashboardAnalyticsErrorCode } from './dashboard-analytics-errors';

export const CONTENT_ANALYTICS_DEFAULT_RANGE: ContentAnalyticsRangeKey = '30d';
/** Every range whose cost is only justified once a day. */
export const CONTENT_ANALYTICS_LONG_RANGES: ContentAnalyticsRangeKey[] = ['90d', '6m', '1y'];

export const CONTENT_ANALYTICS_CORE_INTERVAL_MS = PROFILE_ANALYTICS_NETWORK_MIN_INTERVAL_MS;
export const CONTENT_ANALYTICS_LONG_RANGE_TTL_MS = 24 * 60 * 60 * 1000;
/** Long ranges are spread across runs so one alarm never spends the budget. */
export const CONTENT_ANALYTICS_LONG_RANGES_PER_RUN = 1;
export const CONTENT_ANALYTICS_RETRY_DELAY_MS = 15 * 60 * 1000;
export const CONTENT_ANALYTICS_RESTRICTION_RETRY_MS = 12 * 60 * 60 * 1000;

export const CONTENT_ANALYTICS_POST_ENRICHMENT_PER_RUN = 3;
export const CONTENT_ANALYTICS_POST_ENRICHMENT_TTL_MS = 24 * 60 * 60 * 1000;
export const CONTENT_ANALYTICS_POST_ENRICHMENT_INTERVAL_MS = 30 * 60 * 1000;
/** Enrichment checkpoints stay small; older entries fall out of the window. */
export const CONTENT_ANALYTICS_POST_ENRICHMENT_MEMORY = 200;

export const CONTENT_ANALYTICS_SLOW_METRICS_TTL_MS = 24 * 60 * 60 * 1000;

export type DashboardAnalyticsSyncTrigger =
  | 'install'
  | 'update'
  | 'chrome_startup'
  | 'service_worker'
  | 'sign_in'
  | 'first_extension_entry'
  | 'linkedin_open'
  | 'linkedin_activity'
  | 'profile_metadata_changed'
  | 'dashboard_open'
  | 'invite_sent'
  | 'alarm'
  | 'manual'
  | 'history_resume'
  | 'history_repair';

export interface ContentAnalyticsRangeState {
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  nextDueAt?: number;
  nextRetryAt?: number;
  lastErrorCode?: DashboardAnalyticsErrorCode;
}

export interface ContentAnalyticsPostEnrichmentState {
  lastRunAt?: number;
  nextDueAt?: number;
  /** Activity id -> last successful enrichment time. Bounded by memory limit. */
  enrichedAt: Record<string, number>;
  lastErrorCode?: DashboardAnalyticsErrorCode;
}

export interface ContentAnalyticsSyncState {
  version: 1;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  nextDueAt?: number;
  nextRetryAt?: number;
  retryKind?: ProfileAnalyticsRetryKind;
  lastErrorCode?: DashboardAnalyticsErrorCode;
  ranges: Partial<Record<ContentAnalyticsRangeKey, ContentAnalyticsRangeState>>;
  postEnrichment: ContentAnalyticsPostEnrichmentState;
  slowMetricsNextDueAt?: number;
}

/**
 * Dashboard Analytics reuses the persisted Profile Analytics state so an
 * upgrade never resets cadence, budgets, retries or the history checkpoint.
 * Content-specific scheduling lives in its own sub-state.
 */
export interface DashboardAnalyticsSyncState extends ProfileAnalyticsSyncState {
  content?: ContentAnalyticsSyncState;
  lastSyncRunId?: string;
  /** Set once the account has entered the extension UI at least once. */
  firstExtensionEntryAt?: number;
}

export function createContentAnalyticsSyncState(): ContentAnalyticsSyncState {
  return { version: 1, ranges: {}, postEnrichment: { enrichedAt: {} } };
}

/** Adds the content sub-state to any previously stored Profile Analytics state. */
export function migrateToDashboardAnalyticsSyncState(
  state: ProfileAnalyticsSyncState | DashboardAnalyticsSyncState
): DashboardAnalyticsSyncState {
  const dashboardState = state as DashboardAnalyticsSyncState;
  if (dashboardState.content?.version === 1 && dashboardState.content.postEnrichment) {
    return dashboardState;
  }
  return {
    ...dashboardState,
    content: {
      ...createContentAnalyticsSyncState(),
      ...(dashboardState.content || {}),
      version: 1,
      ranges: dashboardState.content?.ranges || {},
      postEnrichment: dashboardState.content?.postEnrichment || { enrichedAt: {} },
    },
  };
}

export function getContentAnalyticsState(state: DashboardAnalyticsSyncState): ContentAnalyticsSyncState {
  return state.content || createContentAnalyticsSyncState();
}

export function isContentAnalyticsCoreDue({
  now,
  state,
  trigger,
}: {
  now: number;
  state: DashboardAnalyticsSyncState;
  trigger: DashboardAnalyticsSyncTrigger;
}): boolean {
  const content = getContentAnalyticsState(state);
  if (content.nextRetryAt && now < content.nextRetryAt) {
    // A real LinkedIn restriction is never bypassed; a short standard retry is.
    if (content.retryKind === 'restriction') return false;
    if (trigger !== 'manual' && trigger !== 'dashboard_open' && trigger !== 'linkedin_open' && trigger !== 'sign_in') {
      return false;
    }
  }
  if (!content.lastSuccessAt) return true;
  return content.nextDueAt
    ? now >= content.nextDueAt
    : now - content.lastSuccessAt >= CONTENT_ANALYTICS_CORE_INTERVAL_MS;
}

/** Long ranges refresh on their own TTL and never delay the 30-day core. */
export function selectDueContentAnalyticsLongRanges({
  now,
  state,
  limit = CONTENT_ANALYTICS_LONG_RANGES_PER_RUN,
}: {
  now: number;
  state: DashboardAnalyticsSyncState;
  limit?: number;
}): ContentAnalyticsRangeKey[] {
  const content = getContentAnalyticsState(state);
  return CONTENT_ANALYTICS_LONG_RANGES.filter((rangeKey) => {
    const rangeState = content.ranges[rangeKey];
    if (rangeState?.nextRetryAt && now < rangeState.nextRetryAt) return false;
    if (!rangeState?.lastSuccessAt) return true;
    return now >= (rangeState.nextDueAt || rangeState.lastSuccessAt + CONTENT_ANALYTICS_LONG_RANGE_TTL_MS);
  })
    .sort((left, right) => {
      const leftAt = content.ranges[left]?.lastSuccessAt || 0;
      const rightAt = content.ranges[right]?.lastSuccessAt || 0;
      return leftAt - rightAt;
    })
    .slice(0, Math.max(0, limit));
}

export function isContentAnalyticsPostEnrichmentDue({
  now,
  state,
}: {
  now: number;
  state: DashboardAnalyticsSyncState;
}): boolean {
  const { postEnrichment } = getContentAnalyticsState(state);
  if (!postEnrichment.lastRunAt) return true;
  return now >= (postEnrichment.nextDueAt || postEnrichment.lastRunAt + CONTENT_ANALYTICS_POST_ENRICHMENT_INTERVAL_MS);
}

/**
 * Picks the next bounded slice of posts to enrich. Ordering is newest-first
 * among posts whose lifetime metrics are stale, so the visible table fills in
 * from the top and a run never becomes an unbounded N+1.
 */
export function selectPostsForEnrichment({
  now,
  enrichment,
  posts,
  limit = CONTENT_ANALYTICS_POST_ENRICHMENT_PER_RUN,
}: {
  now: number;
  enrichment: ContentAnalyticsPostEnrichmentState;
  posts: Array<{ activityId: string; publishedAt: number }>;
  limit?: number;
}): string[] {
  const postEnrichment = enrichment;
  return posts
    .filter((post) => {
      const enrichedAt = postEnrichment.enrichedAt[post.activityId];
      return !enrichedAt || now - enrichedAt >= CONTENT_ANALYTICS_POST_ENRICHMENT_TTL_MS;
    })
    .sort((left, right) => right.publishedAt - left.publishedAt)
    .slice(0, Math.max(0, limit))
    .map((post) => post.activityId);
}

export function recordPostEnrichment(
  enrichment: ContentAnalyticsPostEnrichmentState,
  activityIds: string[],
  now: number
): ContentAnalyticsPostEnrichmentState {
  const enrichedAt = { ...enrichment.enrichedAt };
  activityIds.forEach((activityId) => {
    enrichedAt[activityId] = now;
  });
  const trimmed = Object.entries(enrichedAt)
    .sort(([, left], [, right]) => right - left)
    .slice(0, CONTENT_ANALYTICS_POST_ENRICHMENT_MEMORY);
  return { ...enrichment, enrichedAt: Object.fromEntries(trimmed), lastRunAt: now };
}

export function getContentAnalyticsScheduledIntervalMs(randomValue = Math.random()): number {
  const normalized = Math.min(1, Math.max(0, randomValue));
  return Math.round(
    PROFILE_ANALYTICS_NETWORK_MIN_INTERVAL_MS +
      normalized * (PROFILE_ANALYTICS_NETWORK_MAX_INTERVAL_MS - PROFILE_ANALYTICS_NETWORK_MIN_INTERVAL_MS)
  );
}

/**
 * Heavy LinkedIn work is the only thing the connection-history lock may
 * postpone. Fast Profile and Content cores always run.
 */
export function isHeavyDashboardAnalyticsWork(
  work: 'profile_core' | 'content_core' | 'post_enrichment' | 'connection_history'
): boolean {
  return work === 'post_enrichment' || work === 'connection_history';
}

export interface DashboardAnalyticsSyncRequest {
  trigger: DashboardAnalyticsSyncTrigger;
  preferredTabId?: number;
}

function triggerPriority(trigger: DashboardAnalyticsSyncTrigger): number {
  // The first authenticated extension entry is the only trigger allowed to
  // create the one-time history bootstrap, so it must never be dropped.
  if (trigger === 'first_extension_entry') return 7;
  if (trigger === 'history_repair' || trigger === 'history_resume') return 6;
  if (trigger === 'profile_metadata_changed') return 5;
  if (trigger === 'manual') return 4;
  if (trigger === 'dashboard_open') return 3;
  if (trigger === 'sign_in' || trigger === 'install' || trigger === 'update' || trigger === 'linkedin_open') return 2;
  return 1;
}

/** Keeps only one strongest follow-up request while the coordinator is active. */
export function selectPendingDashboardAnalyticsRequest(
  active: DashboardAnalyticsSyncRequest,
  pending: DashboardAnalyticsSyncRequest | null,
  incoming: DashboardAnalyticsSyncRequest
): DashboardAnalyticsSyncRequest | null {
  if (incoming.trigger === active.trigger && incoming.preferredTabId === active.preferredTabId) return pending;
  if (triggerPriority(incoming.trigger) <= triggerPriority(active.trigger) && incoming.trigger !== 'dashboard_open') {
    return pending;
  }
  if (!pending || triggerPriority(incoming.trigger) >= triggerPriority(pending.trigger)) return incoming;
  return pending;
}
