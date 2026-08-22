import { describe, expect, it } from 'vitest';
import { parseContentAnalyticsTopPosts } from '../content-analytics-top-posts-parser';
import { isDashboardAnalyticsError } from '../../../background/dashboard-analytics/dashboard-analytics-errors';
import {
  buildTopPostsEmptyEngagementsFixture,
  buildTopPostsImpressionsFixture,
} from './fixtures/content-analytics-top-posts';

describe('parseContentAnalyticsTopPosts', () => {
  it('reads post identity, text, links and the selected range metric', () => {
    const result = parseContentAnalyticsTopPosts(buildTopPostsImpressionsFixture(), 'IMPRESSIONS');

    expect(result.posts).toHaveLength(1);
    const [post] = result.posts;
    expect(post.activityUrn).toBe('urn:li:activity:7497022560266780672');
    expect(post.shareUrn).toBe('urn:li:share:7497022560266780672');
    expect(post.text).toBe('Sample post body for parser tests.');
    expect(post.linkedinUrl).toContain('/feed/update/urn:li:activity:7497022560266780672');
    expect(post.analyticsUrl).toContain('/analytics/post-summary/');
    expect(post.metrics.impressions).toBe(1245);
  });

  it('parses a locale-formatted metric title', () => {
    const result = parseContentAnalyticsTopPosts(
      buildTopPostsImpressionsFixture({ metricTitle: '2.340' }),
      'IMPRESSIONS'
    );

    expect(result.posts[0].metrics.impressions).toBe(2340);
  });

  it('never collapses activity and share urns into two posts', () => {
    const result = parseContentAnalyticsTopPosts(buildTopPostsImpressionsFixture(), 'IMPRESSIONS');

    expect(new Set(result.posts.map((post) => post.activityUrn)).size).toBe(result.posts.length);
  });

  it('leaves reposts undefined when LinkedIn reports numShares as null', () => {
    const result = parseContentAnalyticsTopPosts(buildTopPostsImpressionsFixture(), 'IMPRESSIONS');

    expect(result.posts[0].metrics.reposts).toBeUndefined();
    expect(result.posts[0].metrics.reactions).toBe(8);
  });

  it('keeps an explicit zero repost count', () => {
    const result = parseContentAnalyticsTopPosts(
      buildTopPostsImpressionsFixture({ numShares: 0 }),
      'IMPRESSIONS'
    );

    expect(result.posts[0].metrics.reposts).toBe(0);
  });

  it('stores the engagements metric under LinkedIn engagements, not our reactions', () => {
    const result = parseContentAnalyticsTopPosts(
      buildTopPostsImpressionsFixture({ metricTitle: '12', metricText: 'Engagements' }),
      'ENGAGEMENTS'
    );

    expect(result.posts[0].metrics.linkedInEngagements).toBe(12);
    expect(result.posts[0].metrics.impressions).toBeUndefined();
  });

  it('reports an empty Engagements response as an empty state, not as missing posts', () => {
    const result = parseContentAnalyticsTopPosts(buildTopPostsEmptyEngagementsFixture(), 'ENGAGEMENTS');

    expect(result.posts).toHaveLength(0);
    expect(result.emptyState).toBe(true);
    expect(result.emptyStateTitle).toContain('enough information');
  });

  it('raises a typed error for an unrecognised response shape', () => {
    expect.assertions(2);
    try {
      parseContentAnalyticsTopPosts({ data: { data: {} } }, 'IMPRESSIONS');
    } catch (error) {
      expect(isDashboardAnalyticsError(error)).toBe(true);
      expect(isDashboardAnalyticsError(error) && error.code).toBe('unsupported_graphql_shape');
    }
  });
});
