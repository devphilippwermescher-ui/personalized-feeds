import { describe, expect, it } from 'vitest';
import type { ContentAnalyticsPost } from 'shared/types';
import {
  buildContentPostRows,
  filterPostsToRange,
  searchContentPostRows,
  toContentPostRow,
} from '../content-posts-view';

const RANGE = { startDate: '2026-07-24', endDate: '2026-08-22' };

function post(overrides: Partial<ContentAnalyticsPost> = {}): ContentAnalyticsPost {
  return {
    id: '7497022560266780672',
    activityUrn: 'urn:li:activity:7497022560266780672',
    text: 'Warum Performance Max Kampagnen nicht immer die beste Wahl sind\nEin langer Text folgt hier.',
    linkedinUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7497022560266780672',
    publishedAt: Date.UTC(2026, 7, 22, 10, 0, 0),
    publishedAtSource: 'activity_urn',
    syncRunId: 'run-1',
    capturedAt: 1,
    source: 'top_posts',
    ...overrides,
  };
}

describe('filterPostsToRange', () => {
  it('keeps only posts published inside the active range', () => {
    const rows = filterPostsToRange(
      [
        post({ id: 'in', publishedAt: Date.UTC(2026, 7, 1) }),
        post({ id: 'before', publishedAt: Date.UTC(2026, 5, 1) }),
        post({ id: 'after', publishedAt: Date.UTC(2026, 8, 1) }),
      ],
      RANGE
    );

    expect(rows.map((row) => row.id)).toEqual(['in']);
  });

  it('returns nothing when no range has been collected', () => {
    expect(filterPostsToRange([post()], undefined)).toEqual([]);
  });
});

describe('toContentPostRow', () => {
  it('uses the first non-empty line as the table title', () => {
    expect(toContentPostRow(post()).title).toBe('Warum Performance Max Kampagnen nicht immer die beste Wahl sind');
  });

  it('derives the engagement rate from range metrics when they exist', () => {
    const row = toContentPostRow(
      post({
        rangeMetrics: { impressions: 1245, reactions: 8, comments: 3, reposts: 1 },
        currentPostMetrics: { impressions: 5000, reactions: 40, comments: 10, reposts: 5 },
      })
    );

    expect(row.engagementRate).toBeCloseTo((12 / 1245) * 100, 10);
  });

  it('falls back to lifetime metrics rather than mixing scopes', () => {
    const row = toContentPostRow(
      post({ currentPostMetrics: { impressions: 500, reactions: 5, comments: 0, reposts: 0 } })
    );

    expect(row.engagementRate).toBeCloseTo(1, 10);
  });

  it('returns null for a post with no impressions, never a fake zero percent', () => {
    const row = toContentPostRow(post({ rangeMetrics: { impressions: 0, reactions: 0, comments: 0, reposts: 0 } }));

    expect(row.engagementRate).toBeNull();
  });

  it('leaves the engagement rate undefined when nothing was collected', () => {
    expect(toContentPostRow(post()).engagementRate).toBeUndefined();
  });

  it('keeps a not-yet-enriched metric absent so the table can show a dash', () => {
    const row = toContentPostRow(post({ rangeMetrics: { impressions: 1245 } }));

    expect(row.metrics.impressions).toBe(1245);
    expect(row.metrics.reposts).toBeUndefined();
  });
});

describe('buildContentPostRows', () => {
  it('sorts newest first', () => {
    const rows = buildContentPostRows(
      [
        post({ id: 'older', publishedAt: Date.UTC(2026, 7, 1) }),
        post({ id: 'newer', publishedAt: Date.UTC(2026, 7, 20) }),
      ],
      RANGE
    );

    expect(rows.map((row) => row.id)).toEqual(['newer', 'older']);
  });
});

describe('searchContentPostRows', () => {
  const rows = buildContentPostRows(
    [
      post({ id: 'pmax', text: 'Warum Performance Max Kampagnen' }),
      post({ id: 'roas', text: 'Case Study: Wie wir den ROAS um 340% gesteigert haben' }),
    ],
    RANGE
  );

  it('matches post text case-insensitively', () => {
    expect(searchContentPostRows(rows, 'roas').map((row) => row.id)).toEqual(['roas']);
    expect(searchContentPostRows(rows, 'PERFORMANCE').map((row) => row.id)).toEqual(['pmax']);
  });

  it('returns every row for an empty search', () => {
    expect(searchContentPostRows(rows, '   ')).toHaveLength(2);
  });

  it('returns nothing when the term matches no post', () => {
    expect(searchContentPostRows(rows, 'nothing here')).toEqual([]);
  });
});
