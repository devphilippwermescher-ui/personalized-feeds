import { describe, expect, it } from 'vitest';
import type { ContentAnalyticsDailySnapshot } from 'shared/types';
import {
  buildContentMetricSeries,
  buildRangeDateKeys,
  filterDailySnapshotsToRange,
  isDateKeyInRange,
} from '../content-metric-series';

const RANGE = { startDate: '2026-08-16', endDate: '2026-08-22' };

function day(
  date: string,
  metrics: ContentAnalyticsDailySnapshot['metrics'],
  coverage: ContentAnalyticsDailySnapshot['coverage'] = {}
): ContentAnalyticsDailySnapshot {
  return { id: date, date, metrics, coverage, syncRunId: 'run-1', capturedAt: 1 };
}

describe('range filtering', () => {
  it('treats both bounds as inclusive UTC days', () => {
    expect(isDateKeyInRange('2026-08-16', RANGE.startDate, RANGE.endDate)).toBe(true);
    expect(isDateKeyInRange('2026-08-22', RANGE.startDate, RANGE.endDate)).toBe(true);
    expect(isDateKeyInRange('2026-08-15', RANGE.startDate, RANGE.endDate)).toBe(false);
  });

  it('keeps only in-range daily snapshots', () => {
    const filtered = filterDailySnapshotsToRange(
      [day('2026-08-15', {}), day('2026-08-16', {}), day('2026-08-23', {})],
      RANGE
    );

    expect(filtered.map((entry) => entry.date)).toEqual(['2026-08-16']);
  });

  it('lists every inclusive day of a range', () => {
    expect(buildRangeDateKeys(RANGE.startDate, RANGE.endDate)).toHaveLength(7);
    expect(buildRangeDateKeys('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});

describe('buildContentMetricSeries', () => {
  const dailySnapshots = [
    day('2026-08-20', { impressions: 100, posts: 1 }, { impressions: 'exact', posts: 'exact' }),
    day('2026-08-22', { impressions: 400, posts: 2 }, { impressions: 'exact', posts: 'exact' }),
  ];

  it('builds an exact daily impressions series across the whole range', () => {
    const series = buildContentMetricSeries({ metric: 'impressions', dailySnapshots, range: RANGE });

    expect(series.available).toBe(true);
    expect(series.points).toHaveLength(7);
    expect(series.points[4]).toMatchObject({ dateKey: '2026-08-20', value: 100 });
    expect(series.points[6]).toMatchObject({ dateKey: '2026-08-22', value: 400 });
  });

  it('leaves uncollected days empty rather than filling them with zeros', () => {
    const series = buildContentMetricSeries({ metric: 'impressions', dailySnapshots, range: RANGE });

    expect(series.points[0].value).toBeUndefined();
  });

  it('builds the posts series from publish-date counts', () => {
    const series = buildContentMetricSeries({ metric: 'posts', dailySnapshots, range: RANGE });

    expect(series.available).toBe(true);
    expect(series.points[6].value).toBe(2);
  });

  it.each(['reactions', 'comments', 'reposts', 'engagementRate'] as const)(
    'reports %s as unavailable instead of inventing a daily trend',
    (metric) => {
      const series = buildContentMetricSeries({ metric, dailySnapshots, range: RANGE });

      expect(series.available).toBe(false);
      expect(series.points).toEqual([]);
      expect(series.emptyLabel).toMatch(/does not publish this metric per day/);
    }
  );

  it('respects an explicit unavailable coverage flag', () => {
    const series = buildContentMetricSeries({
      metric: 'impressions',
      dailySnapshots: [day('2026-08-20', { impressions: 100 }, { impressions: 'unavailable' })],
      range: RANGE,
    });

    expect(series.available).toBe(false);
  });

  it('reports nothing collected when no range has been published', () => {
    const series = buildContentMetricSeries({ metric: 'impressions', dailySnapshots, range: undefined });

    expect(series.available).toBe(false);
    expect(series.emptyLabel).toMatch(/no content data/i);
  });
});
