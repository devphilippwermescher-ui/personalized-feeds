import { describe, expect, it } from 'vitest';
import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';
import {
  hasProfileSnapshotChanged,
  hasSearchAppearancesChanged,
  hasSocialSellingIndexChanged,
} from '../profile-analytics-change-detector';

const profile: ProfileAnalyticsProfileSnapshot = {
  linkedinUrl: 'https://www.linkedin.com/in/test',
  linkedinUsername: 'test',
  displayName: 'Test User',
  connectionsCount: 83,
  followersCount: 80,
  connectionDateCounts: { '2026-08-01': 1 },
  updatedAt: 1,
  sourceUrl: 'old',
};

describe('profile analytics change detector', () => {
  it('ignores collection metadata when the real profile values are unchanged', () => {
    expect(
      hasProfileSnapshotChanged(
        { ...profile, followerGrowthUpdatedAt: 1 },
        { ...profile, updatedAt: 2, sourceUrl: 'new', followerGrowthUpdatedAt: 2 }
      )
    ).toBe(false);
  });

  it('detects changed current totals and connection history', () => {
    expect(hasProfileSnapshotChanged(profile, { ...profile, connectionsCount: 86 })).toBe(true);
    expect(
      hasProfileSnapshotChanged(profile, {
        ...profile,
        connectionDateCounts: { '2026-08-01': 1, '2026-08-08': 3 },
      })
    ).toBe(true);
  });

  it('ignores Search Appearances timestamps but detects a new value', () => {
    const current = { totalCount: 5, periodLabel: 'Past 7 days', updatedAt: 1, sourceUrl: 'old' };
    expect(hasSearchAppearancesChanged(current, { ...current, updatedAt: 2, sourceUrl: 'new' })).toBe(false);
    expect(hasSearchAppearancesChanged(current, { ...current, totalCount: 6 })).toBe(true);
  });

  it('ignores SSI timestamps but detects a changed member score', () => {
    const current = { score: 16, updatedAt: 1, sourceUrl: 'old' };
    expect(hasSocialSellingIndexChanged(current, { ...current, updatedAt: 2, sourceUrl: 'new' })).toBe(false);
    expect(hasSocialSellingIndexChanged(current, { ...current, score: 17 })).toBe(true);
  });
});
