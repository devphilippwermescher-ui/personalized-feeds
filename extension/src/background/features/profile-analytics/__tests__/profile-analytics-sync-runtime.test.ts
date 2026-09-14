import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProfileAnalyticsSyncState } from '../profile-analytics-sync-policy';
import {
  getNextProfileAnalyticsAlarmAt,
  getStoredProfileAnalyticsSyncState,
  recoverInterruptedProfileAnalyticsState,
} from '../profile-analytics-sync-runtime';

describe('Profile Analytics sync runtime', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('clears metric syncing flags left by a stopped service worker', () => {
    const state = createProfileAnalyticsSyncState('user');
    state.attemptStartedAt = 100;
    state.attemptExpiresAt = 200;
    state.status = {
      status: 'syncing',
      metrics: {
        connections: { status: 'syncing', lastSuccessAt: 90 },
        followers: { status: 'syncing' },
        socialSellingIndex: { status: 'success', lastSuccessAt: 80 },
      },
    };

    const recovered = recoverInterruptedProfileAnalyticsState(state);

    expect(recovered.attemptStartedAt).toBeUndefined();
    expect(recovered.attemptExpiresAt).toBeUndefined();
    expect(recovered.status.metrics.connections?.status).toBe('success');
    expect(recovered.status.metrics.followers?.status).toBe('idle');
    expect(recovered.status.metrics.socialSellingIndex?.status).toBe('success');
  });

  it('recovers an interrupted history batch and makes it immediately retryable', () => {
    const state = createProfileAnalyticsSyncState('user');
    state.networkNextDueAt = Date.now() + 100_000;
    state.historyAttemptInProgress = true;
    state.historyCheckpoint = {
      version: 1,
      expectedTotal: 100,
      nextStartIndex: 20,
      connectionDatesById: { a: '2026-08-10' },
      recentConnectionIds: ['a'],
      collectedUniqueCount: 1,
      lastAttemptAt: 10,
      status: 'running',
    };

    const recovered = recoverInterruptedProfileAnalyticsState(state);

    expect(recovered.historyAttemptInProgress).toBe(false);
    expect(recovered.historyCheckpoint?.status).toBe('pending');
    expect(recovered.historyNextRetryAt).toBeTypeOf('number');
    expect(getNextProfileAnalyticsAlarmAt(recovered, Date.now())).toBe(recovered.historyNextRetryAt);
  });

  it('migrates a blocked fixed-window budget without preserving the old all-day cooldown', async () => {
    const legacy = createProfileAnalyticsSyncState('user');
    legacy.version = 2;
    legacy.networkBudgetTokens = undefined;
    legacy.networkBudgetUpdatedAt = undefined;
    legacy.networkCyclesInWindow = 30;
    legacy.requestWindowStartedAt = 100;
    legacy.networkNextRetryAt = 200;
    legacy.status.metrics.connections = {
      status: 'blocked',
      errorCode: 'request_budget_reached',
      lastSuccessAt: 90,
      nextRetryAt: 200,
    };
    legacy.status.metrics.followers = {
      status: 'blocked',
      errorCode: 'request_budget_reached',
      nextRetryAt: 200,
    };
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ mfp_profile_analytics_sync_v6: legacy }),
          set,
        },
      },
    });

    const migrated = await getStoredProfileAnalyticsSyncState('user');

    expect(migrated).toEqual(
      expect.objectContaining({
        version: 3,
        networkBudgetTokens: 30,
        networkNextRetryAt: undefined,
        requestWindowStartedAt: undefined,
        networkCyclesInWindow: undefined,
      })
    );
    expect(migrated?.status.metrics.connections?.status).toBe('success');
    expect(migrated?.status.metrics.followers?.status).toBe('idle');
    expect(set).toHaveBeenCalledOnce();
  });
});
