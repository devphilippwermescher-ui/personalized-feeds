import { calculateEngagementRate } from 'shared/content-analytics-metrics';
import type { ContentAnalyticsPost, ContentAnalyticsRangeSnapshot } from 'shared/types';
import type { ContentPostRow } from '../types';
import { isDateKeyInRange, toUtcDateKey } from './content-metric-series';

const POST_TITLE_SOURCE_LIMIT = 400;

function toPostTitle(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim().length > 0) || text.trim();
  return firstLine.slice(0, POST_TITLE_SOURCE_LIMIT);
}

export function filterPostsToRange(
  posts: ContentAnalyticsPost[],
  range: Pick<ContentAnalyticsRangeSnapshot, 'startDate' | 'endDate'> | undefined
): ContentAnalyticsPost[] {
  if (!range) return [];
  return posts.filter((post) => isDateKeyInRange(toUtcDateKey(new Date(post.publishedAt)), range.startDate, range.endDate));
}

/**
 * Builds one table/card row per post.
 *
 * Range metrics and lifetime metrics are never blended: the engagement rate is
 * derived from whichever scope actually provided the impressions, so a post can
 * never divide lifetime reactions by range impressions.
 */
export function toContentPostRow(post: ContentAnalyticsPost): ContentPostRow {
  const scope =
    typeof post.rangeMetrics?.impressions === 'number' ? post.rangeMetrics : post.currentPostMetrics || {};
  const metrics = { ...(post.currentPostMetrics || {}), ...(post.rangeMetrics || {}) };

  return {
    id: post.id,
    post,
    title: toPostTitle(post.text),
    publishedAt: new Date(post.publishedAt),
    metrics,
    engagementRate: calculateEngagementRate(scope),
  };
}

export function buildContentPostRows(
  posts: ContentAnalyticsPost[],
  range: Pick<ContentAnalyticsRangeSnapshot, 'startDate' | 'endDate'> | undefined
): ContentPostRow[] {
  return filterPostsToRange(posts, range)
    .map(toContentPostRow)
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());
}

/** Client-side search over the post body, matching what the reader can see. */
export function searchContentPostRows(rows: ContentPostRow[], searchTerm: string): ContentPostRow[] {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) => row.post.text.toLowerCase().includes(normalized));
}
