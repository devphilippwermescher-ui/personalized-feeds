import { describe, expect, it } from 'vitest';
import {
  aggregateEngagementRate,
  calculateEngagementRate,
  getContentAnalyticsPostId,
  getContentAnalyticsRangeId,
  mergeContentAnalyticsMetrics,
} from 'shared/content-analytics-metrics';
import { stripUndefinedDeep } from 'shared/firestore/serialize';

describe('calculateEngagementRate', () => {
  it('uses only reactions, comments and reposts as the numerator', () => {
    const rate = calculateEngagementRate({
      impressions: 1000,
      reactions: 8,
      comments: 3,
      reposts: 1,
    });
    expect(rate).toBeCloseTo(1.2, 10);
  });

  it('ignores LinkedIn engagements, saves and sends', () => {
    const withExtras = calculateEngagementRate({ impressions: 200, reactions: 2, comments: 0, reposts: 0 });
    expect(withExtras).toBeCloseTo(1, 10);
  });

  it('returns null when impressions are zero so the UI can show a dash', () => {
    expect(calculateEngagementRate({ impressions: 0, reactions: 4, comments: 1, reposts: 0 })).toBeNull();
  });

  it('returns undefined when no social metric was ever collected', () => {
    expect(calculateEngagementRate({ impressions: 100 })).toBeUndefined();
  });

  it('treats a missing social metric as zero once at least one is present', () => {
    expect(calculateEngagementRate({ impressions: 100, reactions: 5 })).toBeCloseTo(5, 10);
  });
});

describe('aggregateEngagementRate', () => {
  it('weights by impressions rather than averaging post percentages', () => {
    const weighted = aggregateEngagementRate([
      { impressions: 1000, reactions: 10, comments: 0, reposts: 0 },
      { impressions: 10, reactions: 5, comments: 0, reposts: 0 },
    ]);
    expect(weighted).toBeCloseTo((15 / 1010) * 100, 10);
  });

  it('returns null when the whole range has no impressions', () => {
    expect(aggregateEngagementRate([{ impressions: 0, reactions: 0, comments: 0, reposts: 0 }])).toBeNull();
  });

  it('returns undefined for an empty range', () => {
    expect(aggregateEngagementRate([])).toBeUndefined();
  });
});

describe('content analytics identifiers', () => {
  it('builds stable preset range ids and scoped custom ids', () => {
    expect(getContentAnalyticsRangeId('30d', '2026-07-24', '2026-08-22')).toBe('30d');
    expect(getContentAnalyticsRangeId('custom', '2026-01-01', '2026-01-31')).toBe('custom_2026-01-01_2026-01-31');
  });

  it('canonicalises activity and share urns onto the same numeric post id', () => {
    expect(getContentAnalyticsPostId('urn:li:activity:7497022560266780672')).toBe('7497022560266780672');
    expect(getContentAnalyticsPostId('urn:li:share:7497022560266780672')).toBe('7497022560266780672');
  });
});

describe('serialization', () => {
  it('never writes undefined values', () => {
    const cleaned = stripUndefinedDeep({
      a: 1,
      b: undefined,
      nested: { c: undefined, d: 'keep' },
      list: [1, undefined, 3],
    });
    expect(cleaned).toEqual({ a: 1, nested: { d: 'keep' }, list: [1, 3] });
    expect(Object.keys(cleaned)).not.toContain('b');
  });

  it('keeps an explicit null (a known-but-undefined engagement rate)', () => {
    expect(stripUndefinedDeep({ engagementRate: null })).toEqual({ engagementRate: null });
  });
});

describe('mergeContentAnalyticsMetrics', () => {
  it('keeps previously collected values when a source omits them', () => {
    const merged = mergeContentAnalyticsMetrics(
      { impressions: 10, reactions: 2 },
      { comments: 1, reactions: undefined }
    );
    expect(merged).toEqual({ impressions: 10, reactions: 2, comments: 1 });
  });
});
