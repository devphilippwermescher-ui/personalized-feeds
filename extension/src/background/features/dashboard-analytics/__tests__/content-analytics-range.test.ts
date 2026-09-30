import { describe, expect, it } from 'vitest';
import {
  addUtcDays,
  countUtcDaysInclusive,
  getContentAnalyticsRangeRequest,
  isUtcDateInRange,
  toUtcDateKey,
} from '../content-analytics-range';

// 2026-08-22T20:11:06Z - late in the UTC day, to catch timezone drift.
const NOW = Date.UTC(2026, 7, 22, 20, 11, 6);

describe('getContentAnalyticsRangeRequest', () => {
  it('requests 30 days as an explicit custom window rather than LinkedIn Past28Days', () => {
    const request = getContentAnalyticsRangeRequest('30d', NOW);

    expect(request.linkedInRange).toBe('Custom');
    expect(request.startDate).toBe('2026-07-24');
    expect(request.endDate).toBe('2026-08-22');
    expect(countUtcDaysInclusive(request.startDate, request.endDate)).toBe(30);
  });

  it('uses LinkedIn native tokens where they match exactly', () => {
    expect(getContentAnalyticsRangeRequest('90d', NOW)).toMatchObject({
      linkedInRange: 'Past90Days',
      timeRange: 'past_90_days',
    });
    expect(getContentAnalyticsRangeRequest('1y', NOW)).toMatchObject({
      linkedInRange: 'Past365Days',
      timeRange: 'past_365_days',
    });
  });

  it('requests 6 months as a 183 day custom window', () => {
    const request = getContentAnalyticsRangeRequest('6m', NOW);

    expect(request.linkedInRange).toBe('Custom');
    expect(countUtcDaysInclusive(request.startDate, request.endDate)).toBe(183);
  });

  it('passes an explicit custom range through unchanged', () => {
    const request = getContentAnalyticsRangeRequest('custom', NOW, {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });

    expect(request).toMatchObject({ startDate: '2026-02-01', endDate: '2026-02-28', linkedInRange: 'Custom' });
  });

  it('refuses a custom range without dates instead of silently guessing one', () => {
    expect(() => getContentAnalyticsRangeRequest('custom', NOW)).toThrow(/explicit start and end dates/);
  });
});

describe('UTC day helpers', () => {
  it('normalises timestamps to UTC day keys', () => {
    expect(toUtcDateKey(Date.UTC(2026, 7, 22, 23, 59, 59))).toBe('2026-08-22');
    expect(toUtcDateKey(Date.UTC(2026, 7, 23, 0, 0, 0))).toBe('2026-08-23');
  });

  it('adds days across month boundaries', () => {
    expect(addUtcDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addUtcDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('treats range bounds as inclusive', () => {
    expect(isUtcDateInRange('2026-07-24', '2026-07-24', '2026-08-22')).toBe(true);
    expect(isUtcDateInRange('2026-08-22', '2026-07-24', '2026-08-22')).toBe(true);
    expect(isUtcDateInRange('2026-08-23', '2026-07-24', '2026-08-22')).toBe(false);
  });
});
