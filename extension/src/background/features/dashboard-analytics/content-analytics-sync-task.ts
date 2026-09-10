import {
  calculateEngagementRate,
  getContentAnalyticsPostId,
  getContentAnalyticsRangeId,
} from 'shared/content-analytics-metrics';
import type {
  ContentAnalyticsDailySnapshot,
  ContentAnalyticsMetricCoverage,
  ContentAnalyticsPost,
  ContentAnalyticsRangeKey,
  ContentAnalyticsRangeSnapshot,
} from 'shared/types';
import type { ContentAnalyticsTopPost } from '../../../linkedin/content-analytics/content-analytics-top-posts-parser';
import { fetchContentAnalyticsForRange, type ContentAnalyticsFetchResult } from './content-analytics-api';
import {
  getContentAnalyticsRangeRequest,
  isUtcDateInRange,
  toUtcDateKey,
  type ContentAnalyticsRangeRequest,
} from './content-analytics-range';
import { fetchContentAnalyticsTopPosts } from './content-analytics-top-posts-api';
import { DashboardAnalyticsError } from './dashboard-analytics-errors';

export interface ContentAnalyticsRangeResult {
  rangeKey: ContentAnalyticsRangeKey;
  range: ContentAnalyticsRangeSnapshot;
  daily: ContentAnalyticsDailySnapshot[];
  posts: ContentAnalyticsPost[];
  postsTruncated: boolean;
}

/**
 * Daily coverage for the metrics LinkedIn does not break down per day.
 *
 * Splitting a range aggregate across days, or attributing a post's lifetime
 * reactions to its publish date, would invent data, so these stay explicitly
 * unavailable until an exact daily source is wired in.
 */
const UNAVAILABLE_DAILY_SOCIAL_COVERAGE: ContentAnalyticsMetricCoverage = {
  reactions: 'unavailable',
  comments: 'unavailable',
  reposts: 'unavailable',
  saves: 'unavailable',
  sends: 'unavailable',
  engagementRate: 'unavailable',
};

function toContentAnalyticsPost({
  post,
  request,
  syncRunId,
  capturedAt,
}: {
  post: ContentAnalyticsTopPost;
  request: ContentAnalyticsRangeRequest;
  syncRunId: string;
  capturedAt: number;
}): ContentAnalyticsPost {
  return {
    id: getContentAnalyticsPostId(post.activityUrn),
    activityUrn: post.activityUrn,
    shareUrn: post.shareUrn,
    text: post.text,
    linkedinUrl: post.linkedinUrl,
    analyticsUrl: post.analyticsUrl,
    publishedAt: post.publishedAt,
    publishedAtSource: post.publishedAtSource,
    rangeMetrics: {
      ...post.metrics,
      engagementRate: calculateEngagementRate(post.metrics) ?? undefined,
    },
    rangeStart: request.startDate,
    rangeEnd: request.endDate,
    rangeKey: request.rangeKey,
    syncRunId,
    capturedAt,
    source: 'top_posts',
  };
}

function buildDailySnapshots({
  analytics,
  request,
  posts,
  postsTruncated,
  syncRunId,
  capturedAt,
}: {
  analytics: ContentAnalyticsFetchResult;
  request: ContentAnalyticsRangeRequest;
  posts: ContentAnalyticsPost[];
  postsTruncated: boolean;
  syncRunId: string;
  capturedAt: number;
}): ContentAnalyticsDailySnapshot[] {
  const byDate = new Map<string, ContentAnalyticsDailySnapshot>();
  const ensureDay = (date: string): ContentAnalyticsDailySnapshot => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created: ContentAnalyticsDailySnapshot = {
      id: date,
      date,
      metrics: {},
      coverage: { ...UNAVAILABLE_DAILY_SOCIAL_COVERAGE },
      syncRunId,
      capturedAt,
    };
    byDate.set(date, created);
    return created;
  };

  (analytics.dailyImpressions || []).forEach((point) => {
    const day = ensureDay(point.date);
    day.metrics.impressions = point.value;
    day.coverage.impressions = analytics.coverage.impressions === 'derived' ? 'derived' : 'exact';
  });
  (analytics.dailyLinkedInEngagements || []).forEach((point) => {
    const day = ensureDay(point.date);
    day.metrics.linkedInEngagements = point.value;
    day.coverage.linkedInEngagements = 'exact';
  });

  // Posts per day come from real publish timestamps, never from a split total.
  const postsByDate = new Map<string, number>();
  posts.forEach((post) => {
    const date = toUtcDateKey(post.publishedAt);
    if (!isUtcDateInRange(date, request.startDate, request.endDate)) return;
    postsByDate.set(date, (postsByDate.get(date) || 0) + 1);
  });
  byDate.forEach((day) => {
    day.metrics.posts = postsByDate.get(day.date) || 0;
    day.coverage.posts = postsTruncated ? 'partial' : 'exact';
  });
  postsByDate.forEach((count, date) => {
    const day = ensureDay(date);
    day.metrics.posts = count;
    day.coverage.posts = postsTruncated ? 'partial' : 'exact';
  });

  return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Collects one Content Analytics range: the aggregate screen, its daily
 * series, and the base post list.
 *
 * Top Posts is always requested with `metricType=IMPRESSIONS`. LinkedIn
 * answers the Engagements variant with an empty state whenever engagements are
 * zero, so it can never be the source of the post list.
 */
export async function runContentAnalyticsRangeTask({
  linkedInTabId,
  profileUrn,
  rangeKey,
  syncRunId,
  now = Date.now(),
  customRange,
}: {
  linkedInTabId: number | undefined;
  profileUrn: string | undefined;
  rangeKey: ContentAnalyticsRangeKey;
  syncRunId: string;
  now?: number;
  customRange?: { startDate: string; endDate: string };
}): Promise<ContentAnalyticsRangeResult> {
  const request = getContentAnalyticsRangeRequest(rangeKey, now, customRange);
  const analytics = await fetchContentAnalyticsForRange({ linkedInTabId, range: request, capturedAt: now });

  // LinkedIn states its own inclusive window; prefer it over our computed one.
  const resolvedRequest: ContentAnalyticsRangeRequest = {
    ...request,
    startDate: analytics.startDate || request.startDate,
    endDate: analytics.endDate || request.endDate,
  };

  let posts: ContentAnalyticsPost[] = [];
  let postsTruncated = false;
  let postsError: DashboardAnalyticsError | undefined;
  try {
    const topPosts = await fetchContentAnalyticsTopPosts({
      linkedInTabId,
      profileUrn: profileUrn || '',
      range: resolvedRequest,
      metricType: 'IMPRESSIONS',
      capturedAt: now,
    });
    posts = topPosts.posts.map((post) =>
      toContentAnalyticsPost({ post, request: resolvedRequest, syncRunId, capturedAt: now })
    );
    postsTruncated = typeof topPosts.totalCount === 'number' && topPosts.totalCount > topPosts.posts.length;
  } catch (error) {
    // A failed post list must not discard a valid aggregate.
    postsError = error instanceof DashboardAnalyticsError ? error : undefined;
    if (!postsError) throw error;
  }

  const metrics = {
    ...analytics.metrics,
    posts: postsError ? undefined : posts.length,
  };
  const coverage: ContentAnalyticsMetricCoverage = {
    ...analytics.coverage,
    posts: postsError ? 'unavailable' : postsTruncated ? 'partial' : 'exact',
  };
  const engagementRate = calculateEngagementRate(metrics);
  if (engagementRate !== undefined) {
    metrics.engagementRate = engagementRate;
    coverage.engagementRate =
      analytics.coverage.reactions === 'exact' &&
      analytics.coverage.comments === 'exact' &&
      analytics.coverage.reposts === 'exact'
        ? 'exact'
        : 'partial';
  } else {
    coverage.engagementRate = 'unavailable';
  }

  const range: ContentAnalyticsRangeSnapshot = {
    id: getContentAnalyticsRangeId(rangeKey, resolvedRequest.startDate, resolvedRequest.endDate),
    rangeKey,
    startDate: resolvedRequest.startDate,
    endDate: resolvedRequest.endDate,
    timezone: 'UTC',
    metrics,
    coverage,
    syncRunId,
    capturedAt: analytics.capturedAt,
    publishedAt: now,
    sourceUrl: analytics.sourceUrl,
    linkedInRange: analytics.linkedInRange,
  };

  return {
    rangeKey,
    range,
    daily: buildDailySnapshots({
      analytics,
      request: resolvedRequest,
      posts,
      postsTruncated,
      syncRunId,
      capturedAt: now,
    }),
    posts,
    postsTruncated,
  };
}
