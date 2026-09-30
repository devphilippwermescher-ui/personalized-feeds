import { describe, expect, it } from 'vitest';
import { parseContentAnalyticsRsc } from '../content-analytics-rsc-parser';
import { isDashboardAnalyticsError } from '../../../background/features/dashboard-analytics/dashboard-analytics-errors';
import { buildContentAnalyticsRscFixture } from './fixtures/content-analytics-rsc';

describe('parseContentAnalyticsRsc', () => {
  it('reads the aggregate metrics LinkedIn renders on the Content Analytics screen', () => {
    const result = parseContentAnalyticsRsc(buildContentAnalyticsRscFixture());

    expect(result.metrics).toEqual({
      impressions: 17,
      linkedInEngagements: 4,
      reactions: 2,
      comments: 1,
      reposts: 0,
      saves: 3,
      sends: 1,
    });
    expect(result.coverage.impressions).toBe('exact');
    expect(result.coverage.reactions).toBe('exact');
  });

  it('keeps LinkedIn Engagements separate from our social metrics', () => {
    const result = parseContentAnalyticsRsc(buildContentAnalyticsRscFixture({ engagements: 9, reactions: 2 }));

    expect(result.metrics.linkedInEngagements).toBe(9);
    expect(result.metrics.reactions).toBe(2);
  });

  it('normalises the daily series to UTC day keys', () => {
    const result = parseContentAnalyticsRsc(
      buildContentAnalyticsRscFixture({ impressions: 6, impressionsSeries: [1, 2, 0, 0, 0, 0, 3] })
    );

    expect(result.dailyImpressions?.[0]).toEqual({ date: '2026-08-16', value: 1 });
    expect(result.dailyImpressions?.[6]).toEqual({ date: '2026-08-22', value: 3 });
    expect(result.dailyImpressions).toHaveLength(7);
  });

  it('differences a cumulative series instead of publishing running totals', () => {
    const result = parseContentAnalyticsRsc(
      buildContentAnalyticsRscFixture({
        impressions: 6,
        impressionsSeries: [1, 3, 3, 3, 3, 3, 6],
        cumulativeImpressionsSeries: [1, 3, 3, 3, 3, 3, 6],
      })
    );

    // Only the cumulative variant is present, so daily values are exact diffs.
    expect(result.dailyImpressions).toEqual([
      { date: '2026-08-16', value: 1 },
      { date: '2026-08-17', value: 2 },
      { date: '2026-08-18', value: 0 },
      { date: '2026-08-19', value: 0 },
      { date: '2026-08-20', value: 0 },
      { date: '2026-08-21', value: 0 },
      { date: '2026-08-22', value: 3 },
    ]);
  });

  it('reads the inclusive UTC window and LinkedIn range token', () => {
    const result = parseContentAnalyticsRsc(buildContentAnalyticsRscFixture());

    expect(result.startDate).toBe('2026-08-16');
    expect(result.endDate).toBe('2026-08-22');
    expect(result.linkedInRange).toBe('Past7Days');
    expect(result.topPostsUrl).toContain('/analytics/creator/top-posts/');
  });

  it('treats a real zero as a value rather than missing data', () => {
    const result = parseContentAnalyticsRsc(
      buildContentAnalyticsRscFixture({ impressions: 0, engagements: 0, impressionsSeries: [0, 0, 0, 0, 0, 0, 0] })
    );

    expect(result.metrics.impressions).toBe(0);
    expect(result.coverage.impressions).toBe('exact');
  });

  it('marks a missing breakdown row unavailable instead of zero', () => {
    const result = parseContentAnalyticsRsc(buildContentAnalyticsRscFixture({ socialRows: false }));

    expect(result.metrics.reactions).toBeUndefined();
    expect(result.coverage.reactions).toBe('unavailable');
  });

  it('derives the impressions total from the series when the card is missing', () => {
    const result = parseContentAnalyticsRsc(
      buildContentAnalyticsRscFixture({ omitImpressionsCard: true, impressionsSeries: [2, 0, 0, 0, 0, 0, 5] })
    );

    expect(result.metrics.impressions).toBe(7);
    expect(result.coverage.impressions).toBe('derived');
  });

  it('raises a typed unsupported-shape error rather than reporting zeros', () => {
    expect.assertions(2);
    try {
      parseContentAnalyticsRsc('1:"$Sreact.fragment"\n2:I["x",[],"Screen"]');
    } catch (error) {
      expect(isDashboardAnalyticsError(error)).toBe(true);
      expect(isDashboardAnalyticsError(error) && error.code).toBe('unsupported_rsc_shape');
    }
  });
});
