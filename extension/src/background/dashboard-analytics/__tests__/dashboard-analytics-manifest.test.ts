import { describe, expect, it } from 'vitest';
import {
  buildContentAnalyticsSnapshot,
  buildDashboardAnalyticsManifest,
  deriveDashboardAnalyticsStatus,
  type DashboardAnalyticsPublishInput,
} from '../dashboard-analytics-manifest';
import type { ContentAnalyticsRangeSnapshot } from 'shared/types';

const PUBLISHED_AT = 1_800_000_000_000;

const currentRange: ContentAnalyticsRangeSnapshot = {
  id: '30d',
  rangeKey: '30d',
  startDate: '2026-07-24',
  endDate: '2026-08-22',
  timezone: 'UTC',
  metrics: { impressions: 1800, posts: 17, reactions: 22, comments: 4, reposts: 0, engagementRate: 1.44 },
  coverage: { impressions: 'exact', posts: 'exact' },
  syncRunId: 'run-1',
  capturedAt: PUBLISHED_AT - 5_000,
  publishedAt: PUBLISHED_AT,
  sourceUrl: 'https://www.linkedin.com/flagship-web/analytics/creator/content/',
};

function publishInput(patch: Partial<DashboardAnalyticsPublishInput> = {}): DashboardAnalyticsPublishInput {
  return {
    userId: 'user-1',
    syncRunId: 'run-1',
    trigger: 'alarm',
    startedAt: PUBLISHED_AT - 20_000,
    publishedAt: PUBLISHED_AT,
    defaultRangeKey: '30d',
    profile: { status: 'success', capturedAt: PUBLISHED_AT - 10_000 },
    content: { status: 'success', capturedAt: PUBLISHED_AT - 5_000 },
    ranges: [currentRange],
    daily: [],
    currentRange,
    ...patch,
  };
}

describe('deriveDashboardAnalyticsStatus', () => {
  it('is successful when every collected source succeeded', () => {
    expect(deriveDashboardAnalyticsStatus([{ status: 'success' }, { status: 'success' }])).toBe('success');
  });

  it('is partial when one source failed and another succeeded', () => {
    expect(deriveDashboardAnalyticsStatus([{ status: 'success' }, { status: 'failed' }])).toBe('partial');
  });

  it('is blocked when every source was rate limited', () => {
    expect(deriveDashboardAnalyticsStatus([{ status: 'blocked' }, { status: 'blocked' }])).toBe('blocked');
  });

  it('ignores skipped and absent sources', () => {
    expect(deriveDashboardAnalyticsStatus([{ status: 'success' }, { status: 'skipped' }, undefined])).toBe(
      'success'
    );
  });
});

describe('buildDashboardAnalyticsManifest', () => {
  it('records one sync run id, its trigger and per-source freshness', () => {
    const manifest = buildDashboardAnalyticsManifest(publishInput());

    expect(manifest.syncRunId).toBe('run-1');
    expect(manifest.trigger).toBe('alarm');
    expect(manifest.publishedAt).toBe(PUBLISHED_AT);
    expect(manifest.profile.capturedAt).toBe(PUBLISHED_AT - 10_000);
    expect(manifest.content.capturedAt).toBe(PUBLISHED_AT - 5_000);
  });

  it('reports partial when Content failed but Profile succeeded', () => {
    const manifest = buildDashboardAnalyticsManifest(
      publishInput({
        content: { status: 'failed', errorCode: 'linkedin_restricted', message: 'Showing the last saved data.' },
        ranges: [],
        currentRange: undefined,
      })
    );

    expect(manifest.status).toBe('partial');
    expect(manifest.content.errorCode).toBe('linkedin_restricted');
  });
});

describe('buildContentAnalyticsSnapshot', () => {
  it('shares the sync run id and published time with the Profile snapshot patch', () => {
    const input = publishInput();
    const snapshot = buildContentAnalyticsSnapshot(input);
    const manifest = buildDashboardAnalyticsManifest(input);

    expect(snapshot.syncRunId).toBe(manifest.syncRunId);
    expect(snapshot.publishedAt).toBe(manifest.publishedAt);
    expect(snapshot.capturedAt).toBe(input.content.capturedAt);
  });

  it('omits the range when a partial run collected nothing new', () => {
    const snapshot = buildContentAnalyticsSnapshot(
      publishInput({ currentRange: undefined, ranges: [], content: { status: 'failed' } })
    );

    expect(snapshot.range).toBeUndefined();
    expect(snapshot.defaultRangeKey).toBe('30d');
  });
});
