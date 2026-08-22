import type { DateRangePreset } from '../../hooks/useDateRangeSelection';
import type { ContentMetricDefinition, ContentRangeKey } from './types';

/** Mirrors the ranges the extension collects, in the order the header shows. */
export const CONTENT_TIME_RANGES: Array<DateRangePreset<ContentRangeKey>> = [
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: '6m', label: '6 months', days: 183 },
  { key: '1y', label: '1 year', days: 365 },
];

export const CONTENT_METRICS: ContentMetricDefinition[] = [
  { key: 'posts', label: 'Posts', tone: 'blue', color: '#2563eb', kind: 'count' },
  { key: 'impressions', label: 'Impressions', tone: 'violet', color: '#8b5cf6', kind: 'count' },
  { key: 'engagementRate', label: 'Engagement Rate', tone: 'mint', color: '#0d9488', kind: 'percent' },
  { key: 'reactions', label: 'Reactions', tone: 'rose', color: '#e11d48', kind: 'count' },
  { key: 'comments', label: 'Comments', tone: 'sky', color: '#0a66c2', kind: 'count' },
  { key: 'reposts', label: 'Reposts', tone: 'amber', color: '#f59e0b', kind: 'count' },
];

export const CONTENT_POSTS_PAGE_SIZE = 100;
export const CONTENT_ANALYTICS_TAB_QUERY_PARAM = 'tab';
