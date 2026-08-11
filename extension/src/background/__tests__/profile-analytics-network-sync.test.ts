import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsertProfileAnalyticsSnapshot: vi.fn(),
  markTrackedConnectionsAccepted: vi.fn(),
  fetchLinkedInConnectionsSnapshot: vi.fn(),
  fetchFollowersAnalyticsFromLinkedInTab: vi.fn(),
  getLinkedInCsrfToken: vi.fn(),
}));

vi.mock('shared/firestore-service', () => ({
  upsertProfileAnalyticsSnapshot: mocks.upsertProfileAnalyticsSnapshot,
}));
vi.mock('../connection-invite-lifecycle', () => ({
  markTrackedConnectionsAccepted: mocks.markTrackedConnectionsAccepted,
}));
vi.mock('../linkedin-connections-api', () => ({
  fetchLinkedInConnectionsSnapshot: mocks.fetchLinkedInConnectionsSnapshot,
}));
vi.mock('../linkedin-followers-analytics-api', () => ({
  fetchFollowersAnalyticsFromLinkedInTab: mocks.fetchFollowersAnalyticsFromLinkedInTab,
}));
vi.mock('../profile-viewers-api-client', () => ({
  getLinkedInCsrfToken: mocks.getLinkedInCsrfToken,
}));

import { syncProfileNetworkMetrics } from '../profile-analytics-network-sync';

describe('Profile Analytics light network sync', () => {
  const collectedAt = Date.UTC(2026, 7, 11, 12);
  const currentSnapshot = {
    profile: {
      linkedinUrl: 'https://www.linkedin.com/in/example/',
      linkedinUsername: 'example',
      displayName: 'Example User',
      connectionsCount: 90,
      recentConnectionIds: ['known-user'],
      followersCount: 91,
      followersCountExact: true,
      updatedAt: collectedAt - 1,
      sourceUrl: 'https://www.linkedin.com/voyager/api/me',
    },
    updatedAt: collectedAt - 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLinkedInCsrfToken.mockResolvedValue('csrf');
    mocks.fetchLinkedInConnectionsSnapshot.mockResolvedValue({
      connectionsCount: 92,
      connectionDateCounts: {},
      connectionDateCountsComplete: false,
      recentConnectionIds: ['new-user', 'known-user'],
    });
    mocks.fetchFollowersAnalyticsFromLinkedInTab.mockResolvedValue({
      followersCount: 93,
      followerDailyGrowth: [],
      sourceUrl: 'https://www.linkedin.com/flagship-web/rsc-action/actions/component',
    });
    mocks.upsertProfileAnalyticsSnapshot.mockImplementation(async (_userId, patch) => ({
      ...currentSnapshot,
      ...patch,
      updatedAt: collectedAt,
    }));
  });

  it('reads exact totals and stops incremental ids with a three-page safety cap', async () => {
    const result = await syncProfileNetworkMetrics({
      userId: 'user',
      linkedInTabIds: [42],
      currentSnapshot,
      collectedAt,
    });

    expect(mocks.fetchLinkedInConnectionsSnapshot).toHaveBeenCalledWith('csrf', 42, {
      includeHistory: false,
      knownConnectionIds: ['known-user'],
      maxPages: 3,
    });
    expect(mocks.markTrackedConnectionsAccepted).toHaveBeenCalledWith('user', ['new-user', 'known-user'], collectedAt);
    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user',
      {
        profile: expect.objectContaining({
          connectionsCount: 92,
          followersCount: 93,
          followersCountExact: true,
        }),
      },
      { updatedAt: collectedAt }
    );
    expect(result.connections).toMatchObject({ collected: true, changed: true, value: 92 });
    expect(result.followers).toMatchObject({ collected: true, changed: true, value: 93 });
  });

  it('preserves the previous follower total when LinkedIn omits the exact value', async () => {
    mocks.fetchFollowersAnalyticsFromLinkedInTab.mockResolvedValue({
      error: 'LinkedIn followers response did not contain a result total.',
    });

    const result = await syncProfileNetworkMetrics({
      userId: 'user',
      linkedInTabIds: [42],
      currentSnapshot,
      collectedAt,
    });

    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user',
      { profile: expect.objectContaining({ followersCount: 91, connectionsCount: 92 }) },
      { updatedAt: collectedAt }
    );
    expect(result.followers).toMatchObject({ collected: false, value: 91 });
  });

  it('falls back to the next existing LinkedIn tab when the first tab does not respond', async () => {
    mocks.fetchLinkedInConnectionsSnapshot
      .mockResolvedValueOnce({
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        error: 'LinkedIn Connections tab script timed out after 20000ms',
      })
      .mockResolvedValueOnce({
        connectionsCount: 94,
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        recentConnectionIds: ['new-user', 'known-user'],
      });
    mocks.fetchFollowersAnalyticsFromLinkedInTab.mockResolvedValue({
      followersCount: 95,
      followerDailyGrowth: [],
      sourceUrl: 'https://www.linkedin.com/flagship-web/rsc-action/actions/component',
    });

    const result = await syncProfileNetworkMetrics({
      userId: 'user',
      linkedInTabIds: [11, 22],
      currentSnapshot,
      collectedAt,
    });

    expect(mocks.fetchLinkedInConnectionsSnapshot).toHaveBeenNthCalledWith(1, 'csrf', 11, expect.any(Object));
    expect(mocks.fetchLinkedInConnectionsSnapshot).toHaveBeenNthCalledWith(2, 'csrf', 22, expect.any(Object));
    expect(mocks.fetchFollowersAnalyticsFromLinkedInTab).toHaveBeenCalledWith(22, 'csrf', collectedAt);
    expect(result.connections).toMatchObject({ collected: true, value: 94 });
    expect(result.followers).toMatchObject({ collected: true, value: 95 });
  });
});
