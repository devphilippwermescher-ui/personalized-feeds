import type {
  ContentAnalyticsMetric,
  ContentAnalyticsMetricValues,
  ContentAnalyticsPost,
  ContentAnalyticsRangeKey,
} from 'shared/types';

export type ContentAnalyticsTab = 'content' | 'insights';
export type ContentAnalyticsPostsView = 'table' | 'cards';
export type ContentRangeKey = Exclude<ContentAnalyticsRangeKey, 'custom'>;
export type ActiveContentRangeKey = 'total' | ContentAnalyticsRangeKey;

export interface ContentMetricDefinition {
  key: ContentAnalyticsMetric;
  label: string;
  tone: 'blue' | 'violet' | 'mint' | 'rose' | 'sky' | 'amber';
  color: string;
  /** Percent metrics format and scale differently from counts. */
  kind: 'count' | 'percent';
}

export interface ContentMetricCardModel extends ContentMetricDefinition {
  value: string;
  available: boolean;
}

export interface ContentSeriesPoint {
  date: Date;
  dateKey: string;
  value?: number;
}

export interface ContentMetricSeries {
  points: ContentSeriesPoint[];
  /** `false` when LinkedIn exposes no exact daily source for this metric. */
  available: boolean;
  emptyLabel: string;
}

export interface ContentPostRow {
  id: string;
  post: ContentAnalyticsPost;
  title: string;
  publishedAt: Date;
  metrics: ContentAnalyticsMetricValues;
  engagementRate: number | null | undefined;
}
