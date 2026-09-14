/** Metrics rendered by the Content Analytics cards and chart tabs. */
export type ContentAnalyticsMetric = 'posts' | 'impressions' | 'engagementRate' | 'reactions' | 'comments' | 'reposts';

/**
 * Every value LinkedIn can report for a range, a day, or a single post.
 * `linkedInEngagements` is LinkedIn's own aggregate and is deliberately kept
 * apart from our Engagement Rate numerator.
 */
export interface ContentAnalyticsMetricValues {
  posts?: number;
  impressions?: number;
  linkedInEngagements?: number;
  reactions?: number;
  comments?: number;
  reposts?: number;
  saves?: number;
  sends?: number;
  membersReached?: number;
  inNetworkImpressions?: number;
  outOfNetworkImpressions?: number;
  profileViewersFromPost?: number;
  followersGained?: number;
  /** Percentage in 0-100. `null` marks a known-but-undefined rate (no impressions). */
  engagementRate?: number | null;
}

/** How trustworthy a single metric is inside a snapshot. */
export type ContentAnalyticsCoverage = 'exact' | 'derived' | 'partial' | 'unavailable';

export type ContentAnalyticsMetricCoverage = Partial<
  Record<keyof ContentAnalyticsMetricValues, ContentAnalyticsCoverage>
>;

export type ContentAnalyticsRangeKey = '30d' | '90d' | '6m' | '1y' | 'custom';

export interface ContentAnalyticsRangeSnapshot {
  id: string;
  rangeKey: ContentAnalyticsRangeKey;
  /** Inclusive UTC day, `YYYY-MM-DD`. */
  startDate: string;
  /** Inclusive UTC day, `YYYY-MM-DD`. */
  endDate: string;
  timezone: 'UTC';
  metrics: ContentAnalyticsMetricValues;
  coverage: ContentAnalyticsMetricCoverage;
  syncRunId: string;
  capturedAt: number;
  publishedAt: number;
  sourceUrl: string;
  /** LinkedIn's own range token, kept for diagnostics and re-requests. */
  linkedInRange?: string;
}

export interface ContentAnalyticsDailySnapshot {
  id: string;
  /** UTC day, `YYYY-MM-DD`. */
  date: string;
  metrics: ContentAnalyticsMetricValues;
  coverage: ContentAnalyticsMetricCoverage;
  syncRunId: string;
  capturedAt: number;
}

export interface ContentAnalyticsPost {
  id: string;
  activityUrn: string;
  shareUrn?: string;
  text: string;
  linkedinUrl: string;
  analyticsUrl?: string;
  publishedAt: number;
  publishedAtSource: 'linkedin_timestamp' | 'activity_urn';
  /** Metrics scoped to the collected LinkedIn range. */
  rangeMetrics?: ContentAnalyticsMetricValues;
  /** Lifetime metrics from the post-summary page. Never mixed with `rangeMetrics`. */
  currentPostMetrics?: ContentAnalyticsMetricValues;
  rangeStart?: string;
  rangeEnd?: string;
  rangeKey?: ContentAnalyticsRangeKey;
  syncRunId: string;
  capturedAt: number;
  /** Set when the bounded post-summary enrichment last refreshed this post. */
  enrichedAt?: number;
  source: 'top_posts' | 'top_posts+post_summary';
}

/** Current Content Analytics document rendered by the dashboard first paint. */
export interface ContentAnalyticsSnapshot {
  defaultRangeKey: ContentAnalyticsRangeKey;
  range?: ContentAnalyticsRangeSnapshot;
  postsCount?: number;
  syncRunId: string;
  capturedAt: number;
  publishedAt: number;
  updatedAt: number;
  sourceUrl?: string;
}
