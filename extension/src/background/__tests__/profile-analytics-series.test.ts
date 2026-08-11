import { describe, expect, it } from 'vitest';
import type { ProfileAnalyticsDailySnapshot } from 'shared/types';
import {
  buildConnectionsFollowersPoints,
  getCumulativeMetricChangeInRange,
} from '../../../../dashboard/src/features/profile-analytics/utils/series';

function day(year: number, month: number, date: number): Date {
  return new Date(year, month - 1, date);
}

describe('Connections dashboard series reliability', () => {
  it('ignores a legacy 500 snapshot instead of drawing 1172 -> 500 -> 1172', () => {
    const snapshots: ProfileAnalyticsDailySnapshot[] = [
      {
        id: 'a',
        date: '2026-08-09',
        connectionsCount: 1172,
        connectionsCountExact: true,
        updatedAt: 1,
      },
      { id: 'legacy', date: '2026-08-10', connectionsCount: 500, updatedAt: 2 },
      {
        id: 'b',
        date: '2026-08-11',
        connectionsCount: 1172,
        connectionsCountExact: true,
        updatedAt: 3,
      },
    ];

    const points = buildConnectionsFollowersPoints({
      snapshots,
      range: { start: day(2026, 8, 9), end: day(2026, 8, 11) },
      connectionDateCountsComplete: false,
    });

    expect(points.map((point) => point.connectionsCount)).toEqual([1172, 1172, 1172]);
  });

  it('uses only exact daily snapshots for range changes', () => {
    const snapshots: ProfileAnalyticsDailySnapshot[] = [
      {
        id: 'baseline',
        date: '2026-08-08',
        connectionsCount: 1172,
        connectionsCountExact: true,
        updatedAt: 1,
      },
      { id: 'legacy', date: '2026-08-09', connectionsCount: 500, updatedAt: 2 },
      {
        id: 'final',
        date: '2026-08-10',
        connectionsCount: 1173,
        connectionsCountExact: true,
        updatedAt: 3,
      },
    ];

    expect(
      getCumulativeMetricChangeInRange({
        snapshots,
        range: { start: day(2026, 8, 9), end: day(2026, 8, 10) },
        dataKey: 'connectionsCount',
      })
    ).toBe(1);
  });

  it('backfills totals and Connections Added only after history is complete', () => {
    const base = {
      snapshots: [] as ProfileAnalyticsDailySnapshot[],
      range: { start: day(2026, 8, 8), end: day(2026, 8, 10) },
      connectionDateCounts: { '2026-08-08': 1, '2026-08-09': 1, '2026-08-10': 1 },
      connectionDateCountsUpdatedAt: day(2026, 8, 10).getTime(),
      currentConnectionsCount: 3,
      currentConnectionsCountExact: true,
    };

    const partial = buildConnectionsFollowersPoints({ ...base, connectionDateCountsComplete: false });
    expect(partial.map((point) => point.connectionsCount)).toEqual([undefined, undefined, undefined]);
    expect(partial.map((point) => point.connectionsAdded)).toEqual([undefined, undefined, undefined]);

    const complete = buildConnectionsFollowersPoints({ ...base, connectionDateCountsComplete: true });
    expect(complete.map((point) => point.connectionsCount)).toEqual([1, 2, 3]);
    expect(complete.map((point) => point.connectionsAdded)).toEqual([1, 1, 1]);
  });

  it('uses the current exact total for today but rejects an unmarked current value', () => {
    const today = new Date();
    const range = { start: today, end: today };
    const exact = buildConnectionsFollowersPoints({
      snapshots: [],
      range,
      currentConnectionsCount: 1179,
      currentConnectionsCountExact: true,
    });
    const legacy = buildConnectionsFollowersPoints({
      snapshots: [],
      range,
      currentConnectionsCount: 500,
      currentConnectionsCountExact: false,
    });

    expect(exact[0].connectionsCount).toBe(1179);
    expect(legacy[0].connectionsCount).toBeUndefined();
  });
});
