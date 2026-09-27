import { describe, expect, it } from 'vitest';
import { parseContentAnalyticsPostSummary } from '../content-analytics-post-summary-parser';
import { isDashboardAnalyticsError } from '../../../background/features/dashboard-analytics/dashboard-analytics-errors';
import { buildPostSummaryRscFixture } from './fixtures/content-analytics-post-summary';

describe('parseContentAnalyticsPostSummary', () => {
  it('reads lifetime post metrics', () => {
    const result = parseContentAnalyticsPostSummary(buildPostSummaryRscFixture());

    expect(result.metrics).toEqual({
      impressions: 1245,
      profileViewersFromPost: 6,
      followersGained: 2,
      reactions: 8,
      comments: 3,
      reposts: 1,
      saves: 4,
      sends: 0,
    });
  });

  it('marks slow-metric fields unavailable until they are fetched separately', () => {
    const result = parseContentAnalyticsPostSummary(buildPostSummaryRscFixture());

    expect(result.coverage.membersReached).toBe('unavailable');
    expect(result.coverage.inNetworkImpressions).toBe('unavailable');
    expect(result.metrics.membersReached).toBeUndefined();
  });

  it('keeps a genuine zero distinct from a missing field', () => {
    const result = parseContentAnalyticsPostSummary(buildPostSummaryRscFixture({ reactions: 0 }));

    expect(result.metrics.reactions).toBe(0);
    expect(result.coverage.reactions).toBe('exact');
  });

  it('raises a typed error when Impressions cannot be located', () => {
    expect.assertions(2);
    try {
      parseContentAnalyticsPostSummary(buildPostSummaryRscFixture({ omitImpressions: true }));
    } catch (error) {
      expect(isDashboardAnalyticsError(error)).toBe(true);
      expect(isDashboardAnalyticsError(error) && error.code).toBe('unsupported_rsc_shape');
    }
  });
});
