import { describe, expect, it } from 'vitest';
import {
  CONTENT_ANALYTICS_LONG_RANGE_TTL_MS,
  CONTENT_ANALYTICS_POST_ENRICHMENT_MEMORY,
  CONTENT_ANALYTICS_POST_ENRICHMENT_PER_RUN,
  createContentAnalyticsSyncState,
  isContentAnalyticsCoreDue,
  isHeavyDashboardAnalyticsWork,
  migrateToDashboardAnalyticsSyncState,
  recordPostEnrichment,
  selectDueContentAnalyticsLongRanges,
  selectPendingDashboardAnalyticsRequest,
  selectPostsForEnrichment,
  type DashboardAnalyticsSyncState,
} from '../dashboard-analytics-sync-policy';
import { createProfileAnalyticsSyncState } from '../../profile-analytics-sync-policy';

const NOW = 1_800_000_000_000;
const HOUR_MS = 60 * 60 * 1000;

function stateWith(patch: Partial<DashboardAnalyticsSyncState>): DashboardAnalyticsSyncState {
  return {
    ...migrateToDashboardAnalyticsSyncState(createProfileAnalyticsSyncState('user-1')),
    ...patch,
  };
}

describe('migrateToDashboardAnalyticsSyncState', () => {
  it('adds the content sub-state without touching existing Profile Analytics scheduling', () => {
    const legacy = {
      ...createProfileAnalyticsSyncState('user-1'),
      networkLastSuccessAt: NOW - HOUR_MS,
      networkNextDueAt: NOW + HOUR_MS,
      historyCheckpoint: {
        version: 1 as const,
        expectedTotal: 500,
        nextStartIndex: 120,
        connectionDatesById: {},
        recentConnectionIds: [],
        collectedUniqueCount: 118,
        lastAttemptAt: NOW,
        status: 'pending' as const,
      },
    };

    const migrated = migrateToDashboardAnalyticsSyncState(legacy);

    expect(migrated.networkLastSuccessAt).toBe(NOW - HOUR_MS);
    expect(migrated.networkNextDueAt).toBe(NOW + HOUR_MS);
    expect(migrated.historyCheckpoint?.nextStartIndex).toBe(120);
    expect(migrated.content).toEqual(createContentAnalyticsSyncState());
  });

  it('is idempotent for an already migrated state', () => {
    const once = migrateToDashboardAnalyticsSyncState(createProfileAnalyticsSyncState('user-1'));
    once.content!.lastSuccessAt = NOW;

    expect(migrateToDashboardAnalyticsSyncState(once).content?.lastSuccessAt).toBe(NOW);
  });
});

describe('isContentAnalyticsCoreDue', () => {
  it('is due on a first run', () => {
    expect(isContentAnalyticsCoreDue({ now: NOW, state: stateWith({}), trigger: 'alarm' })).toBe(true);
  });

  it('is not due before the next scheduled check', () => {
    const state = stateWith({
      content: { ...createContentAnalyticsSyncState(), lastSuccessAt: NOW, nextDueAt: NOW + HOUR_MS },
    });

    expect(isContentAnalyticsCoreDue({ now: NOW + 60_000, state, trigger: 'alarm' })).toBe(false);
    expect(isContentAnalyticsCoreDue({ now: NOW + HOUR_MS, state, trigger: 'alarm' })).toBe(true);
  });

  it('keeps a LinkedIn restriction cooldown even for a manual refresh', () => {
    const state = stateWith({
      content: {
        ...createContentAnalyticsSyncState(),
        lastSuccessAt: NOW - HOUR_MS,
        nextRetryAt: NOW + 6 * HOUR_MS,
        retryKind: 'restriction',
      },
    });

    expect(isContentAnalyticsCoreDue({ now: NOW, state, trigger: 'manual' })).toBe(false);
  });

  it('lets a manual refresh bypass a short standard retry', () => {
    const state = stateWith({
      content: {
        ...createContentAnalyticsSyncState(),
        lastSuccessAt: NOW - HOUR_MS,
        nextRetryAt: NOW + 5 * 60_000,
        retryKind: 'standard',
      },
    });

    expect(isContentAnalyticsCoreDue({ now: NOW, state, trigger: 'alarm' })).toBe(false);
    expect(isContentAnalyticsCoreDue({ now: NOW, state, trigger: 'manual' })).toBe(true);
  });

  it('lets an opened dashboard retry a short ordinary collection failure', () => {
    const state = stateWith({
      content: {
        ...createContentAnalyticsSyncState(),
        nextRetryAt: NOW + 5 * 60_000,
        retryKind: 'standard',
      },
    });

    expect(isContentAnalyticsCoreDue({ now: NOW, state, trigger: 'dashboard_open' })).toBe(true);
  });

  it('never lets an opened dashboard bypass a LinkedIn restriction', () => {
    const state = stateWith({
      content: {
        ...createContentAnalyticsSyncState(),
        nextRetryAt: NOW + 6 * HOUR_MS,
        retryKind: 'restriction',
      },
    });

    expect(isContentAnalyticsCoreDue({ now: NOW, state, trigger: 'dashboard_open' })).toBe(false);
  });
});

describe('selectDueContentAnalyticsLongRanges', () => {
  it('collects at most one long range per run, oldest first', () => {
    const state = stateWith({
      content: {
        ...createContentAnalyticsSyncState(),
        ranges: {
          '90d': { lastSuccessAt: NOW - 2 * CONTENT_ANALYTICS_LONG_RANGE_TTL_MS },
          '6m': { lastSuccessAt: NOW - 3 * CONTENT_ANALYTICS_LONG_RANGE_TTL_MS },
          '1y': { lastSuccessAt: NOW - 1_000 },
        },
      },
    });

    expect(selectDueContentAnalyticsLongRanges({ now: NOW, state })).toEqual(['6m']);
  });

  it('does not refresh a long range inside its 24 hour TTL', () => {
    const state = stateWith({
      content: {
        ...createContentAnalyticsSyncState(),
        ranges: {
          '90d': { lastSuccessAt: NOW - HOUR_MS },
          '6m': { lastSuccessAt: NOW - HOUR_MS },
          '1y': { lastSuccessAt: NOW - HOUR_MS },
        },
      },
    });

    expect(selectDueContentAnalyticsLongRanges({ now: NOW, state })).toEqual([]);
  });

  it('skips a long range that is still in its retry cooldown', () => {
    const state = stateWith({
      content: {
        ...createContentAnalyticsSyncState(),
        ranges: { '90d': { nextRetryAt: NOW + HOUR_MS }, '6m': { lastSuccessAt: NOW }, '1y': { lastSuccessAt: NOW } },
      },
    });

    expect(selectDueContentAnalyticsLongRanges({ now: NOW, state })).toEqual([]);
  });
});

describe('post enrichment checkpointing', () => {
  const posts = Array.from({ length: 10 }, (_, index) => ({
    activityId: `post-${index}`,
    publishedAt: NOW - index * HOUR_MS,
  }));

  it('enriches a bounded newest-first slice', () => {
    const selected = selectPostsForEnrichment({
      now: NOW,
      enrichment: { enrichedAt: {} },
      posts,
    });

    expect(selected).toHaveLength(CONTENT_ANALYTICS_POST_ENRICHMENT_PER_RUN);
    expect(selected[0]).toBe('post-0');
  });

  it('continues from the checkpoint on the next run instead of repeating work', () => {
    const first = selectPostsForEnrichment({ now: NOW, enrichment: { enrichedAt: {} }, posts });
    const checkpoint = recordPostEnrichment({ enrichedAt: {} }, first, NOW);

    const second = selectPostsForEnrichment({ now: NOW + 60_000, enrichment: checkpoint, posts });

    expect(second).not.toEqual(expect.arrayContaining(first));
    expect(second[0]).toBe('post-3');
  });

  it('re-enriches a post once its lifetime metrics go stale', () => {
    const checkpoint = recordPostEnrichment({ enrichedAt: {} }, ['post-0'], NOW - 25 * HOUR_MS);

    expect(selectPostsForEnrichment({ now: NOW, enrichment: checkpoint, posts })[0]).toBe('post-0');
  });

  it('keeps the checkpoint bounded', () => {
    const many = Array.from({ length: CONTENT_ANALYTICS_POST_ENRICHMENT_MEMORY + 50 }, (_, i) => `post-${i}`);
    const checkpoint = recordPostEnrichment({ enrichedAt: {} }, many, NOW);

    expect(Object.keys(checkpoint.enrichedAt)).toHaveLength(CONTENT_ANALYTICS_POST_ENRICHMENT_MEMORY);
  });
});

describe('queue deduplication', () => {
  it('drops a duplicate of the active request', () => {
    expect(
      selectPendingDashboardAnalyticsRequest({ trigger: 'alarm' }, null, { trigger: 'alarm' })
    ).toBeNull();
  });

  it('keeps only the strongest follow-up trigger', () => {
    const pending = selectPendingDashboardAnalyticsRequest({ trigger: 'alarm' }, null, { trigger: 'manual' });
    expect(pending?.trigger).toBe('manual');

    expect(
      selectPendingDashboardAnalyticsRequest({ trigger: 'alarm' }, pending, { trigger: 'linkedin_activity' })
        ?.trigger
    ).toBe('manual');
  });

  it('never drops the first authenticated extension entry', () => {
    expect(
      selectPendingDashboardAnalyticsRequest({ trigger: 'manual' }, { trigger: 'dashboard_open' }, {
        trigger: 'first_extension_entry',
      })?.trigger
    ).toBe('first_extension_entry');
  });
});

describe('isHeavyDashboardAnalyticsWork', () => {
  it('treats only pagination-style work as heavy', () => {
    expect(isHeavyDashboardAnalyticsWork('profile_core')).toBe(false);
    expect(isHeavyDashboardAnalyticsWork('content_core')).toBe(false);
    expect(isHeavyDashboardAnalyticsWork('post_enrichment')).toBe(true);
    expect(isHeavyDashboardAnalyticsWork('connection_history')).toBe(true);
  });
});
