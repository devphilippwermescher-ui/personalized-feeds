import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchContentAnalyticsForRange = vi.fn();
const fetchContentAnalyticsTopPosts = vi.fn();

vi.mock('../content-analytics-api', () => ({
  fetchContentAnalyticsForRange: (...args: unknown[]) => fetchContentAnalyticsForRange(...args),
}));
vi.mock('../content-analytics-top-posts-api', () => ({
  fetchContentAnalyticsTopPosts: (...args: unknown[]) => fetchContentAnalyticsTopPosts(...args),
}));

import { runContentAnalyticsRangeTask } from '../content-analytics-sync-task';
import { DashboardAnalyticsError } from '../dashboard-analytics-errors';

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);

function analyticsResult(overrides: Record<string, unknown> = {}) {
  return {
    linkedInRange: 'Custom',
    startDate: '2026-07-24',
    endDate: '2026-08-22',
    metrics: { impressions: 1000, linkedInEngagements: 30, reactions: 22, comments: 4, reposts: 0 },
    coverage: {
      impressions: 'exact',
      linkedInEngagements: 'exact',
      reactions: 'exact',
      comments: 'exact',
      reposts: 'exact',
    },
    dailyImpressions: [
      { date: '2026-08-21', value: 400 },
      { date: '2026-08-22', value: 600 },
    ],
    dailyLinkedInEngagements: [
      { date: '2026-08-21', value: 10 },
      { date: '2026-08-22', value: 20 },
    ],
    sourceUrl: 'https://www.linkedin.com/flagship-web/analytics/creator/content/',
    capturedAt: NOW,
    ...overrides,
  };
}

function topPost(activityId: string, publishedAt: number, impressions: number) {
  return {
    activityUrn: `urn:li:activity:${activityId}`,
    activityId,
    text: 'Sample',
    linkedinUrl: `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`,
    publishedAt,
    publishedAtSource: 'activity_urn' as const,
    metrics: { impressions },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchContentAnalyticsForRange.mockResolvedValue(analyticsResult());
  fetchContentAnalyticsTopPosts.mockResolvedValue({
    posts: [
      topPost('1', Date.UTC(2026, 7, 22, 9, 0, 0), 600),
      topPost('2', Date.UTC(2026, 7, 21, 9, 0, 0), 400),
    ],
    emptyState: false,
    sourceUrl: 'https://www.linkedin.com/voyager/api/graphql',
    capturedAt: NOW,
    metricType: 'IMPRESSIONS',
  });
});

describe('runContentAnalyticsRangeTask', () => {
  it('always requests the post list with the Impressions metric type', async () => {
    await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    expect(fetchContentAnalyticsTopPosts).toHaveBeenCalledWith(
      expect.objectContaining({ metricType: 'IMPRESSIONS' })
    );
  });

  it('computes the range engagement rate from reactions, comments and reposts only', async () => {
    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    expect(result.range.metrics.engagementRate).toBeCloseTo(2.6, 10);
    expect(result.range.metrics.linkedInEngagements).toBe(30);
    expect(result.range.coverage.engagementRate).toBe('exact');
  });

  it('marks the engagement rate unavailable when its inputs were not collected', async () => {
    fetchContentAnalyticsForRange.mockResolvedValue(
      analyticsResult({
        metrics: { impressions: 1000 },
        coverage: { impressions: 'exact', reactions: 'unavailable' },
      })
    );

    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    expect(result.range.metrics.engagementRate).toBeUndefined();
    expect(result.range.coverage.engagementRate).toBe('unavailable');
  });

  it('returns null rather than a fake zero percent when there were no impressions', async () => {
    fetchContentAnalyticsForRange.mockResolvedValue(
      analyticsResult({ metrics: { impressions: 0, reactions: 0, comments: 0, reposts: 0 } })
    );

    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    expect(result.range.metrics.engagementRate).toBeNull();
  });

  it('builds the posts-per-day series from real publish dates', async () => {
    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    const byDate = Object.fromEntries(result.daily.map((day) => [day.date, day.metrics.posts]));
    expect(byDate['2026-08-22']).toBe(1);
    expect(byDate['2026-08-21']).toBe(1);
    expect(result.daily.every((day) => day.coverage.posts === 'exact')).toBe(true);
  });

  it('never invents daily social metrics', async () => {
    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    result.daily.forEach((day) => {
      expect(day.metrics.reactions).toBeUndefined();
      expect(day.metrics.comments).toBeUndefined();
      expect(day.metrics.reposts).toBeUndefined();
      expect(day.coverage.reactions).toBe('unavailable');
      expect(day.coverage.engagementRate).toBe('unavailable');
    });
  });

  it('keeps exact daily impressions and LinkedIn engagements', async () => {
    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    const lastDay = result.daily[result.daily.length - 1];
    expect(lastDay.metrics.impressions).toBe(600);
    expect(lastDay.metrics.linkedInEngagements).toBe(20);
    expect(lastDay.coverage.impressions).toBe('exact');
  });

  it('keeps the aggregate when the post list fails, and marks posts unavailable', async () => {
    fetchContentAnalyticsTopPosts.mockRejectedValue(
      new DashboardAnalyticsError('query_id_expired', 'LinkedIn rejected the Top Posts query.')
    );

    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    expect(result.range.metrics.impressions).toBe(1000);
    expect(result.range.metrics.posts).toBeUndefined();
    expect(result.range.coverage.posts).toBe('unavailable');
    expect(result.posts).toEqual([]);
  });

  it('stores an exact zero when LinkedIn returns a valid empty post list', async () => {
    fetchContentAnalyticsTopPosts.mockResolvedValue({
      posts: [],
      emptyState: true,
      emptyStateTitle: 'No posts to show',
      totalCount: 0,
      sourceUrl: 'https://www.linkedin.com/voyager/api/graphql',
      capturedAt: NOW,
      metricType: 'IMPRESSIONS',
    });

    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    expect(result.range.metrics.posts).toBe(0);
    expect(result.range.coverage.posts).toBe('exact');
  });

  it('prefers the window LinkedIn itself reports over the computed one', async () => {
    fetchContentAnalyticsForRange.mockResolvedValue(
      analyticsResult({ startDate: '2026-07-25', endDate: '2026-08-21' })
    );

    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    expect(result.range.startDate).toBe('2026-07-25');
    expect(result.range.endDate).toBe('2026-08-21');
  });

  it('stores range metrics separately from lifetime post metrics', async () => {
    const result = await runContentAnalyticsRangeTask({
      linkedInTabId: 7,
      profileUrn: 'urn:li:fsd_profile:ACoAA-example',
      rangeKey: '30d',
      syncRunId: 'run-1',
      now: NOW,
    });

    expect(result.posts[0].rangeMetrics?.impressions).toBe(600);
    expect(result.posts[0].currentPostMetrics).toBeUndefined();
    expect(result.posts[0].rangeStart).toBe('2026-07-24');
    expect(result.posts[0].source).toBe('top_posts');
  });
});
