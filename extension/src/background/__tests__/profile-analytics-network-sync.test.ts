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
      connectionsCountExact: true,
      connectionsCountSource: 'connections_rsc' as const,
      connectionDateCounts: { '2026-08-01': 90 },
      connectionDateCountsComplete: true,
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
      connectionsCountExact: true,
      connectionDateCounts: {},
      connectionDateCountsComplete: false,
      recentConnectionIds: ['new-user', 'known-user'],
      newConnectionDateCounts: { '2026-08-11': 2 },
      connectionRecords: [
        { id: 'new-user-a', connectedDate: '2026-08-11' },
        { id: 'new-user-b', connectedDate: '2026-08-11' },
      ],
      boundaryFound: true,
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
      startIndex: undefined,
    });
    expect(mocks.markTrackedConnectionsAccepted).toHaveBeenCalledWith('user', ['new-user', 'known-user'], collectedAt);
    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user',
      {
        profile: expect.objectContaining({
          connectionsCount: 92,
          connectionsCountExact: true,
          connectionsCountSource: 'connections_rsc',
          connectionDateCounts: { '2026-08-01': 90, '2026-08-11': 2 },
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
        connectionsCountExact: true,
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

  it('accepts an authoritative total decrease without invalidating the completed baseline', async () => {
    mocks.fetchLinkedInConnectionsSnapshot.mockResolvedValue({
      connectionsCount: 89,
      connectionsCountExact: true,
      connectionDateCounts: {},
      connectionDateCountsComplete: false,
      recentConnectionIds: ['known-user'],
      newConnectionDateCounts: {},
      boundaryFound: true,
    });

    const result = await syncProfileNetworkMetrics({
      userId: 'user',
      linkedInTabIds: [42],
      currentSnapshot,
      collectedAt,
    });

    expect(result.connections).toMatchObject({ collected: true, value: 89, repairNeeded: false });
    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user',
      { profile: expect.objectContaining({ connectionsCount: 89, connectionDateCountsComplete: true }) },
      { updatedAt: collectedAt }
    );
  });

  it('does not merge partial dates when the known-id boundary is missing', async () => {
    mocks.fetchLinkedInConnectionsSnapshot.mockResolvedValue({
      connectionsCount: 95,
      connectionsCountExact: true,
      connectionDateCounts: { '2026-08-11': 3 },
      connectionDateCountsComplete: false,
      recentConnectionIds: ['unknown-a', 'unknown-b'],
      newConnectionDateCounts: { '2026-08-11': 3 },
      connectionRecords: [
        { id: 'unknown-a', connectedDate: '2026-08-11' },
        { id: 'unknown-b', connectedDate: '2026-08-11' },
      ],
      boundaryFound: false,
      nextStartIndex: 30,
      paginationComplete: false,
    });

    const result = await syncProfileNetworkMetrics({
      userId: 'user',
      linkedInTabIds: [42],
      currentSnapshot,
      collectedAt,
    });

    expect(result.connections.repairNeeded).toBe(true);
    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user',
      {
        profile: expect.objectContaining({
          connectionsCount: 95,
          connectionDateCounts: { '2026-08-01': 90 },
          connectionDateCountsComplete: true,
          connectionIncrementalStatus: 'catch_up_pending',
        }),
      },
      { updatedAt: collectedAt }
    );
    expect(result.connectionCatchUpCheckpoint).toMatchObject({ nextStartIndex: 30, expectedTotal: 95 });
  });

  it('resumes only the incremental gap and merges it after reaching the frozen known boundary', async () => {
    mocks.fetchLinkedInConnectionsSnapshot
      .mockResolvedValueOnce({
        connectionsCount: 93,
        connectionsCountExact: true,
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        recentConnectionIds: ['new-a', 'new-b'],
        connectionRecords: [
          { id: 'new-a', connectedDate: '2026-08-11' },
          { id: 'new-b', connectedDate: '2026-08-11' },
        ],
        boundaryFound: false,
        nextStartIndex: 30,
        paginationComplete: false,
      })
      .mockResolvedValueOnce({
        connectionsCount: 93,
        connectionsCountExact: true,
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        connectionRecords: [{ id: 'new-c', connectedDate: '2026-08-10' }],
        boundaryFound: true,
        paginationComplete: false,
      });

    const first = await syncProfileNetworkMetrics({
      userId: 'user',
      linkedInTabIds: [42],
      currentSnapshot,
      collectedAt,
    });
    const second = await syncProfileNetworkMetrics({
      userId: 'user',
      linkedInTabIds: [42],
      currentSnapshot,
      connectionCatchUpCheckpoint: first.connectionCatchUpCheckpoint,
      collectedAt: collectedAt + 1,
    });

    expect(mocks.fetchLinkedInConnectionsSnapshot).toHaveBeenLastCalledWith('csrf', 42, {
      includeHistory: false,
      knownConnectionIds: ['known-user'],
      maxPages: 3,
      startIndex: 30,
    });
    expect(second.connectionCatchUpCheckpoint).toBeUndefined();
    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenLastCalledWith(
      'user',
      {
        profile: expect.objectContaining({
          connectionDateCounts: { '2026-08-01': 90, '2026-08-11': 2, '2026-08-10': 1 },
          connectionDateCountsComplete: true,
          connectionIncrementalStatus: 'current',
        }),
      },
      { updatedAt: collectedAt + 1 }
    );
  });
});
