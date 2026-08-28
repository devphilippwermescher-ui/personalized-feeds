import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfileViewersSyncState } from '../profile-viewers-sync-state';

const mocks = vi.hoisted(() => ({
  getStorageValue: vi.fn(),
  setStorageValue: vi.fn(),
}));

vi.mock('../feeds-auth', () => ({
  getStorageValue: mocks.getStorageValue,
  setStorageValue: mocks.setStorageValue,
}));

import { getProfileViewersSyncState } from '../profile-viewers-coordinator-storage';

describe('Profile Visitors coordinator storage migration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes the viewer order and private-summary repair immediately due once', async () => {
    const state = {
      ...createProfileViewersSyncState('user-1', 1_000),
      summaryCollectionVersion: 2 as const,
      backfillStatus: 'complete' as const,
      nextDueAt: 500_000,
      nextCollectionTask: 'private_summary' as const,
      privateSummaryStatus: 'ready' as const,
      privateSummaryKnownStart: 50,
    };
    mocks.getStorageValue.mockResolvedValue({
      pf_profile_viewers_sync: state,
    });

    const migrated = await getProfileViewersSyncState('user-1');

    expect(migrated).toMatchObject({
      summaryCollectionVersion: 4,
      nextDueAt: 50_000,
      nextCollectionTask: 'visible',
      privateSummaryStatus: 'scanning',
      privateSummaryNextStart: 10,
      privateSummaryScanOrigin: 'full',
    });
    expect(migrated.privateSummaryKnownStart).toBeUndefined();
  });

  it('makes the canonical visible-window repair immediately due without restarting history', async () => {
    const state = {
      ...createProfileViewersSyncState('user-1', 1_000),
      visibleCollectionVersion: 2 as const,
      backfillStatus: 'complete' as const,
      backfillCompletedAt: 2_000,
      nextDueAt: 500_000,
      retryAt: 400_000,
      nextCollectionTask: 'private_summary' as const,
      privateSummaryStatus: 'ready' as const,
    };
    mocks.getStorageValue.mockResolvedValue({
      pf_profile_viewers_sync: state,
    });

    const migrated = await getProfileViewersSyncState('user-1');

    expect(migrated).toMatchObject({
      visibleCollectionVersion: 3,
      nextDueAt: 50_000,
      nextCollectionTask: 'visible',
      backfillStatus: 'complete',
      backfillCompletedAt: 2_000,
      privateSummaryStatus: 'ready',
    });
    expect(migrated.retryAt).toBeUndefined();
  });
});
