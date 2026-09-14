import type { ContentAnalyticsRangeKey } from 'shared/types';
import { CONTENT_ANALYTICS_RANGE_DAYS } from 'shared/content-analytics-metrics';

/** LinkedIn's own range tokens for the Content Analytics screen. */
export type LinkedInContentRange = 'Past7Days' | 'Past14Days' | 'Past28Days' | 'Past90Days' | 'Past365Days' | 'Custom';

export interface ContentAnalyticsRangeRequest {
  rangeKey: ContentAnalyticsRangeKey;
  linkedInRange: LinkedInContentRange;
  /** Inclusive UTC day, `YYYY-MM-DD`. */
  startDate: string;
  /** Inclusive UTC day, `YYYY-MM-DD`. */
  endDate: string;
  /** LinkedIn's Top Posts `timeRange` filter value. */
  timeRange: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function toUtcDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function utcDateKeyToTimestamp(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function addUtcDays(date: string, days: number): string {
  return toUtcDateKey(utcDateKeyToTimestamp(date) + days * DAY_MS);
}

export function countUtcDaysInclusive(startDate: string, endDate: string): number {
  return Math.round((utcDateKeyToTimestamp(endDate) - utcDateKeyToTimestamp(startDate)) / DAY_MS) + 1;
}

export function isUtcDateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

/**
 * Maps a product range onto a LinkedIn request.
 *
 * `30 days` and `6 months` have no native LinkedIn equivalent, so they are
 * requested as explicit custom windows. Substituting `Past28Days` for our
 * 30-day card would silently change what the number means.
 */
export function getContentAnalyticsRangeRequest(
  rangeKey: ContentAnalyticsRangeKey,
  now = Date.now(),
  customRange?: { startDate: string; endDate: string }
): ContentAnalyticsRangeRequest {
  const endDate = toUtcDateKey(now);

  if (rangeKey === 'custom') {
    if (!customRange) {
      throw new Error('A custom Content Analytics range requires explicit start and end dates.');
    }
    return {
      rangeKey,
      linkedInRange: 'Custom',
      startDate: customRange.startDate,
      endDate: customRange.endDate,
      timeRange: 'custom',
    };
  }

  const days = CONTENT_ANALYTICS_RANGE_DAYS[rangeKey];
  const startDate = addUtcDays(endDate, -(days - 1));

  if (rangeKey === '90d') {
    return { rangeKey, linkedInRange: 'Past90Days', startDate, endDate, timeRange: 'past_90_days' };
  }
  if (rangeKey === '1y') {
    return { rangeKey, linkedInRange: 'Past365Days', startDate, endDate, timeRange: 'past_365_days' };
  }
  return { rangeKey, linkedInRange: 'Custom', startDate, endDate, timeRange: 'custom' };
}
