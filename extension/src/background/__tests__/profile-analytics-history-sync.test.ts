import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchLinkedInConnectionsSnapshot: vi.fn(),
  getLinkedInCsrfToken: vi.fn(),
  upsertProfileAnalyticsSnapshot: vi.fn(),
}));

vi.mock('../linkedin-connections-api', () => ({
  fetchLinkedInConnectionsSnapshot: mocks.fetchLinkedInConnectionsSnapshot,
}));
vi.mock('../profile-viewers-api-client', () => ({
  getLinkedInCsrfToken: mocks.getLinkedInCsrfToken,
}));
vi.mock('shared/firestore-service', () => ({
  upsertProfileAnalyticsSnapshot: mocks.upsertProfileAnalyticsSnapshot,
}));

import { syncConnectionHistoryBatch } from '../profile-analytics-history-sync';

describe('resumable Connections history sync', () => {
  const collectedAt = Date.UTC(2026, 7, 11, 12);
  const currentSnapshot = {
    profile: {
      linkedinUrl: 'https://www.linkedin.com/in/example/',
      linkedinUsername: 'example',
      displayName: 'Example',
      connectionsCount: 3,
      connectionsCountExact: true,
      connectionsCountSource: 'connections_rsc' as const,
      updatedAt: collectedAt - 1,
      sourceUrl: 'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections',
    },
    updatedAt: collectedAt - 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLinkedInCsrfToken.mockResolvedValue('csrf');
    mocks.upsertProfileAnalyticsSnapshot.mockImplementation(async (_userId, patch) => ({
      ...currentSnapshot,
      ...patch,
      updatedAt: collectedAt,
    }));
  });

  it('stores an incomplete checkpoint and resumes from its cursor', async () => {
    mocks.fetchLinkedInConnectionsSnapshot
      .mockResolvedValueOnce({
        connectionsCount: 3,
        connectionsCountExact: true,
        connectionDateCounts: { '2026-08-10': 2 },
        connectionDateCountsComplete: false,
        connectionRecords: [
          { id: 'a', connectedDate: '2026-08-10' },
          { id: 'b', connectedDate: '2026-08-10' },
        ],
        recentConnectionIds: ['a', 'b'],
        nextStartIndex: 20,
        pagesFetched: 2,
        paginationComplete: false,
      })
      .mockResolvedValueOnce({
        connectionsCount: 3,
        connectionsCountExact: true,
        connectionDateCounts: { '2026-08-09': 1 },
        connectionDateCountsComplete: false,
        connectionRecords: [
          { id: 'b', connectedDate: '2026-08-10' },
          { id: 'c', connectedDate: '2026-08-09' },
        ],
        recentConnectionIds: ['c'],
        pagesFetched: 1,
        paginationComplete: true,
      });

    const first = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      collectedAt,
    });
    expect(first.complete).toBe(false);
    expect(first.checkpoint).toMatchObject({
      expectedTotal: 3,
      nextStartIndex: 20,
      collectedUniqueCount: 2,
      status: 'pending',
    });

    const second = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      checkpoint: first.checkpoint,
      collectedAt: collectedAt + 1,
    });
    expect(mocks.fetchLinkedInConnectionsSnapshot).toHaveBeenLastCalledWith('csrf', 42, {
      includeHistory: true,
      maxPages: 10,
      startIndex: 20,
    });
    expect(second.complete).toBe(true);
    expect(second.checkpoint).toBeUndefined();
    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenLastCalledWith(
      'user',
      {
        profile: expect.objectContaining({
          connectionDateCounts: { '2026-08-10': 2, '2026-08-09': 1 },
          connectionDateCountsComplete: true,
          connectionHistoryKind: 'backfilled_current_connections',
        }),
      },
      { updatedAt: collectedAt + 1 }
    );
  });

  it('does not mark pagination complete when unique ids do not match the exact total', async () => {
    mocks.fetchLinkedInConnectionsSnapshot.mockResolvedValue({
      connectionsCount: 3,
      connectionsCountExact: true,
      connectionDateCounts: { '2026-08-10': 2 },
      connectionDateCountsComplete: false,
      connectionRecords: [
        { id: 'duplicate', connectedDate: '2026-08-10' },
        { id: 'duplicate', connectedDate: '2026-08-10' },
      ],
      pagesFetched: 1,
      paginationComplete: true,
    });

    const result = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      collectedAt,
    });

    expect(result.complete).toBe(false);
    expect(result.checkpoint?.collectedUniqueCount).toBe(1);
    expect(result.checkpoint?.error).toContain('1 dated connections out of 3');
  });

  it('restarts from zero when the authoritative total changes between batches', async () => {
    mocks.fetchLinkedInConnectionsSnapshot.mockResolvedValue({
      connectionsCount: 4,
      connectionsCountExact: true,
      connectionDateCounts: {},
      connectionDateCountsComplete: false,
      connectionRecords: [{ id: 'late-page', connectedDate: '2026-08-08' }],
      nextStartIndex: 30,
      pagesFetched: 1,
      paginationComplete: false,
    });

    const result = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      checkpoint: {
        version: 1,
        expectedTotal: 3,
        nextStartIndex: 20,
        connectionDatesById: { a: '2026-08-10', b: '2026-08-09' },
        recentConnectionIds: ['a', 'b'],
        collectedUniqueCount: 2,
        lastAttemptAt: collectedAt - 1,
        status: 'pending',
      },
      collectedAt,
    });

    expect(result.checkpoint).toMatchObject({ expectedTotal: 4, nextStartIndex: 0, collectedUniqueCount: 0 });
  });
});
