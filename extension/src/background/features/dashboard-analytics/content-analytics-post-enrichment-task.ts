import { calculateEngagementRate } from 'shared/content-analytics-metrics';
import type { ContentAnalyticsPost } from 'shared/types';
import { fetchContentAnalyticsPostSummary } from './content-analytics-post-summary-api';
import { classifyDashboardAnalyticsFailure, redactDiagnosticText } from './dashboard-analytics-errors';
import {
  recordPostEnrichment,
  selectPostsForEnrichment,
  type ContentAnalyticsPostEnrichmentState,
} from './dashboard-analytics-sync-policy';

export interface ContentAnalyticsPostEnrichmentResult {
  posts: ContentAnalyticsPost[];
  enrichment: ContentAnalyticsPostEnrichmentState;
  attempted: number;
  succeeded: number;
  lastErrorCode?: string;
}

/**
 * Bounded post-detail enrichment.
 *
 * Only a fixed number of the most recent stale posts is refreshed per run and
 * progress is checkpointed, so this can never become an unbounded N+1 walk.
 * Lifetime metrics are stored under `currentPostMetrics`; they are never
 * merged into the range-scoped numbers collected from Top Posts.
 */
export async function runContentAnalyticsPostEnrichmentTask({
  linkedInTabId,
  posts,
  enrichment,
  now = Date.now(),
  limit,
}: {
  linkedInTabId: number | undefined;
  posts: ContentAnalyticsPost[];
  enrichment: ContentAnalyticsPostEnrichmentState;
  now?: number;
  limit?: number;
}): Promise<ContentAnalyticsPostEnrichmentResult> {
  const candidates = selectPostsForEnrichment({
    now,
    enrichment,
    posts: posts.map((post) => ({ activityId: post.id, publishedAt: post.publishedAt })),
    limit,
  });
  if (candidates.length === 0 || typeof linkedInTabId !== 'number') {
    return { posts: [], enrichment, attempted: 0, succeeded: 0 };
  }

  const postsById = new Map(posts.map((post) => [post.id, post]));
  const enriched: ContentAnalyticsPost[] = [];
  const succeededIds: string[] = [];
  let lastErrorCode: string | undefined;

  for (const activityId of candidates) {
    const post = postsById.get(activityId);
    if (!post) continue;

    try {
      const summary = await fetchContentAnalyticsPostSummary({
        linkedInTabId,
        activityUrn: post.activityUrn,
        capturedAt: now,
      });
      const currentPostMetrics = {
        ...summary.metrics,
        engagementRate: calculateEngagementRate(summary.metrics) ?? undefined,
      };
      enriched.push({
        ...post,
        currentPostMetrics,
        enrichedAt: now,
        source: 'top_posts+post_summary',
      });
      succeededIds.push(activityId);
    } catch (error) {
      const failure = classifyDashboardAnalyticsFailure(error);
      lastErrorCode = failure.errorCode;
      console.info('[dashboard-analytics] post enrichment skipped', {
        activityId,
        errorCode: failure.errorCode,
        message: redactDiagnosticText(failure.message),
      });
      // LinkedIn restrictions stop the batch; a single bad post does not.
      if (failure.retryKind === 'restriction') break;
    }
  }

  return {
    posts: enriched,
    enrichment: recordPostEnrichment(enrichment, succeededIds, now),
    attempted: candidates.length,
    succeeded: succeededIds.length,
    lastErrorCode,
  };
}
