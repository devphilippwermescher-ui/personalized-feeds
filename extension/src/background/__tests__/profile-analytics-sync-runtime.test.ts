import { describe, expect, it } from 'vitest';
import { createProfileAnalyticsSyncState } from '../profile-analytics-sync-policy';
import { recoverInterruptedProfileAnalyticsState } from '../profile-analytics-sync-runtime';

describe('Profile Analytics sync runtime', () => {
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
});
