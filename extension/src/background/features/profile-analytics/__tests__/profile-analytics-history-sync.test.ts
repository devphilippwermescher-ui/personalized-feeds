import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchLinkedInConnectionsSnapshot: vi.fn(),
  getLinkedInCsrfToken: vi.fn(),
  upsertProfileAnalyticsSnapshot: vi.fn(),
  setJob: vi.fn(),
  getJob: vi.fn(),
  chunks: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../connections/api/connections-api', () => ({
  fetchLinkedInConnectionsSnapshot: mocks.fetchLinkedInConnectionsSnapshot,
}));
vi.mock('../../../platform/linkedin/csrf-token', () => ({
  getLinkedInCsrfToken: mocks.getLinkedInCsrfToken,
}));
vi.mock('shared/firestore-service', () => ({
  PROFILE_ANALYTICS_CONNECTION_HISTORY_VERSION: 2,
  getProfileAnalyticsConnectionAccountKey: () => 'profile:example',
  getProfileAnalyticsConnectionHistoryJobId: () => 'connectionsBootstrap_example',
  getProfileAnalyticsConnectionHistoryJob: mocks.getJob,
  setProfileAnalyticsConnectionHistoryJob: mocks.setJob,
  writeProfileAnalyticsConnectionHistoryChunk: vi.fn(async (_userId, chunk) => {
    mocks.chunks.push(chunk);
  }),
  getProfileAnalyticsConnectionHistoryChunks: vi.fn(async (_userId, sessionId) =>
    mocks.chunks.filter((chunk) => chunk.sessionId === sessionId)
  ),
  upsertProfileAnalyticsSnapshot: mocks.upsertProfileAnalyticsSnapshot,
}));

import {
  ensureConnectionHistoryBootstrapJob,
  reconcileCompletedConnectionHistory,
  resumeConnectionHistoryBootstrap,
  syncConnectionHistoryBatch,
} from '../profile-analytics-history-sync';
import type { ProfileAnalyticsConnectionHistoryJob } from 'shared/types';

describe('one-time Connections history bootstrap', () => {
  const collectedAt = Date.UTC(2026, 7, 11, 12);
  const currentSnapshot = {
    profile: {
      linkedinUrl: 'https://www.linkedin.com/in/example/',
      linkedinUsername: 'example',
      profileUrn: 'profile:example',
      displayName: 'Example',
      connectionsCount: 3,
      connectionsCountExact: true,
      connectionsCountSource: 'connections_rsc' as const,
      updatedAt: collectedAt - 1,
      sourceUrl: 'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections',
    },
    updatedAt: collectedAt - 1,
  };
  const job: ProfileAnalyticsConnectionHistoryJob = {
    id: 'connectionsBootstrap_example',
    version: 2,
    accountKey: 'profile:example',
    status: 'scheduled',
    sessionId: 'session',
    nextStartIndex: 0,
    restartCount: 0,
    batchIndex: 0,
    updatedAt: collectedAt - 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chunks.length = 0;
    mocks.getLinkedInCsrfToken.mockResolvedValue('csrf');
    mocks.getJob.mockReset();
    mocks.upsertProfileAnalyticsSnapshot.mockImplementation(async (_userId, patch) => ({
      ...currentSnapshot,
      ...patch,
      updatedAt: collectedAt,
    }));
  });

  it('starts a new history session when totals exist but history has never run', async () => {
    mocks.getJob.mockResolvedValue(null);

    const created = await ensureConnectionHistoryBootstrapJob({
      userId: 'user',
      profile: currentSnapshot.profile,
      now: collectedAt,
    });

    expect(created).toMatchObject({
      status: 'scheduled',
      expectedTotal: 3,
      collectedCount: 0,
      nextStartIndex: 0,
      batchIndex: 0,
    });
    expect(created.sessionId).toEqual(expect.any(String));
    expect(created.error).toBeUndefined();
    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user',
      {
        profile: expect.objectContaining({
          connectionDateCountsComplete: false,
          connectionHistoryBootstrap: expect.objectContaining({
            status: 'scheduled',
            sessionId: created.sessionId,
          }),
        }),
      },
      { updatedAt: collectedAt }
    );
  });

  it('upgrades an unresumable placeholder repair state to a first-run session', async () => {
    mocks.getJob.mockResolvedValue({
      ...job,
      status: 'needs_repair',
      sessionId: undefined,
      nextStartIndex: undefined,
      error: 'Existing incomplete history requires an explicit resume or restart.',
    });

    const upgraded = await ensureConnectionHistoryBootstrapJob({
      userId: 'user',
      profile: currentSnapshot.profile,
      now: collectedAt,
    });

    expect(upgraded).toMatchObject({
      status: 'scheduled',
      expectedTotal: 3,
      collectedCount: 0,
      nextStartIndex: 0,
    });
    expect(upgraded.sessionId).toEqual(expect.any(String));
    expect(upgraded.error).toBeUndefined();
  });

  it('preserves a real repair state that has a resumable session', async () => {
    const repair = {
      ...job,
      status: 'needs_repair' as const,
      sessionId: 'saved-session',
      error: 'Previous batch needs attention.',
    };
    mocks.getJob.mockResolvedValue(repair);

    const result = await ensureConnectionHistoryBootstrapJob({
      userId: 'user',
      profile: currentSnapshot.profile,
      now: collectedAt,
    });

    expect(result).toBe(repair);
    expect(mocks.setJob).not.toHaveBeenCalled();
  });

  it('resumes a repair job from its persisted session without resetting saved progress', async () => {
    const repairJob: ProfileAnalyticsConnectionHistoryJob = {
      ...job,
      status: 'needs_repair',
      sessionId: 'saved-session',
      nextStartIndex: undefined,
      batchIndex: 3,
      collectedCount: 420,
      expectedTotal: 1_108,
      restartCount: 0,
      error: 'Previous batch needs attention.',
    };
    mocks.getJob.mockResolvedValue(repairJob);
    mocks.chunks.push({
      id: 'saved-session_000002',
      accountKey: 'profile:example',
      sessionId: 'saved-session',
      batchIndex: 2,
      startIndex: 400,
      records: [{ id: 'saved', connectedDate: '2026-08-10' }],
      createdAt: collectedAt - 1,
    });

    const resumed = await resumeConnectionHistoryBootstrap({
      userId: 'user',
      profile: currentSnapshot.profile,
      now: collectedAt,
    });

    expect(resumed).toMatchObject({
      status: 'scheduled',
      sessionId: 'saved-session',
      nextStartIndex: 400,
      batchIndex: 3,
      collectedCount: 420,
      expectedTotal: 1_108,
      restartCount: 1,
    });
    expect(resumed.error).toBeUndefined();
    expect(mocks.setJob).toHaveBeenCalledWith('user', expect.objectContaining({ sessionId: 'saved-session' }));
  });

  it('does not silently start a new import when no resumable session exists', async () => {
    mocks.getJob.mockResolvedValue({
      ...job,
      status: 'needs_repair',
      sessionId: undefined,
      nextStartIndex: undefined,
    });

    await expect(
      resumeConnectionHistoryBootstrap({ userId: 'user', profile: currentSnapshot.profile, now: collectedAt })
    ).rejects.toThrow('no resumable session');
    expect(mocks.setJob).not.toHaveBeenCalled();
  });

  it('restores a stale current snapshot from an already completed server job', async () => {
    const completeJob: ProfileAnalyticsConnectionHistoryJob = {
      ...job,
      status: 'complete',
      expectedTotal: 3,
      collectedCount: 3,
      completedAt: collectedAt - 10,
    };
    const staleSnapshot = {
      ...currentSnapshot,
      profile: {
        ...currentSnapshot.profile,
        connectionDateCountsComplete: true,
        connectionHistoryBootstrap: {
          version: 2 as const,
          accountKey: completeJob.accountKey,
          status: 'needs_repair' as const,
        },
      },
    };

    await reconcileCompletedConnectionHistory({
      userId: 'user',
      currentSnapshot: staleSnapshot,
      job: completeJob,
      now: collectedAt,
    });

    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenCalledWith(
      'user',
      {
        profile: expect.objectContaining({
          connectionDateCountsComplete: true,
          connectionHistoryBootstrap: expect.objectContaining({ status: 'complete' }),
          connectionHistoryBaselineCount: 3,
        }),
      },
      { updatedAt: collectedAt }
    );
    expect(mocks.fetchLinkedInConnectionsSnapshot).not.toHaveBeenCalled();
  });

  it('stores chunks and resumes from the persisted job cursor', async () => {
    mocks.fetchLinkedInConnectionsSnapshot
      .mockResolvedValueOnce({
        connectionsCount: 3,
        connectionsCountExact: true,
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        connectionRecords: [
          { id: 'a', connectedDate: '2026-08-10' },
          { id: 'b', connectedDate: '2026-08-10' },
        ],
        nextStartIndex: 20,
        pagesFetched: 2,
        paginationComplete: false,
      })
      .mockResolvedValueOnce({
        connectionsCount: 3,
        connectionsCountExact: true,
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        connectionRecords: [{ id: 'c', connectedDate: '2026-08-09' }],
        pagesFetched: 1,
        paginationComplete: true,
      });

    const first = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      job,
      collectedAt,
    });
    expect(first.complete).toBe(false);
    expect(first.job).toMatchObject({ expectedTotal: 3, nextStartIndex: 20, batchIndex: 1 });

    const second = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      job: first.job,
      collectedAt: collectedAt + 1,
    });
    expect(mocks.fetchLinkedInConnectionsSnapshot).toHaveBeenLastCalledWith('csrf', 42, {
      includeHistory: true,
      maxPages: 20,
      startIndex: 20,
      paginationDelayMs: 1_125,
      paginationBatchSize: 0,
      requestTimeoutMs: 12_000,
      workTimeoutMs: 70_000,
      scriptTimeoutMs: 75_000,
    });
    expect(second.complete).toBe(true);
    expect(second.job.status).toBe('complete');
    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenLastCalledWith(
      'user',
      {
        profile: expect.objectContaining({
          connectionDateCounts: { '2026-08-10': 2, '2026-08-09': 1 },
          connectionDateCountsComplete: true,
          connectionHistoryDatedCount: 3,
          connectionHistoryUndatedCount: 0,
          connectionHistoryBaselineCount: 3,
        }),
      },
      expect.objectContaining({ updatedAt: expect.any(Number) })
    );
  });

  it('falls back to the cautious request profile after a partial batch error', async () => {
    mocks.fetchLinkedInConnectionsSnapshot
      .mockResolvedValueOnce({
        connectionsCount: 3,
        connectionsCountExact: true,
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        connectionRecords: [{ id: 'a', connectedDate: '2026-08-10' }],
        nextStartIndex: 10,
        pagesFetched: 1,
        paginationComplete: false,
        error: 'LinkedIn tab pagination could not run: timeout',
      })
      .mockResolvedValueOnce({
        connectionsCount: 3,
        connectionsCountExact: true,
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        connectionRecords: [{ id: 'b', connectedDate: '2026-08-09' }],
        nextStartIndex: 20,
        pagesFetched: 1,
        paginationComplete: false,
      });

    const first = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      job,
      collectedAt,
    });
    expect(first.job.mode).toBe('cautious');

    await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      job: first.job,
      collectedAt: collectedAt + 1,
    });
    expect(mocks.fetchLinkedInConnectionsSnapshot).toHaveBeenLastCalledWith(
      'csrf',
      42,
      expect.objectContaining({
        maxPages: 10,
        paginationDelayMs: 2_500,
        requestTimeoutMs: 10_000,
        workTimeoutMs: 40_000,
        scriptTimeoutMs: 45_000,
      })
    );
  });

  it('completes terminal pagination when some connections do not expose a usable date', async () => {
    mocks.fetchLinkedInConnectionsSnapshot.mockResolvedValue({
      connectionsCount: 3,
      connectionsCountExact: true,
      connectionDateCounts: {},
      connectionDateCountsComplete: false,
      connectionRecords: [{ id: 'duplicate', connectedDate: '2026-08-10' }],
      pagesFetched: 1,
      paginationComplete: true,
    });

    const result = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      job: { ...job, restartCount: 1 },
      collectedAt,
    });

    expect(result.complete).toBe(true);
    expect(result.job).toMatchObject({
      status: 'complete',
      collectedCount: 1,
      datedCount: 1,
      undatedCount: 2,
    });
    expect(result.job.error).toBeUndefined();
    expect(mocks.upsertProfileAnalyticsSnapshot).toHaveBeenLastCalledWith(
      'user',
      {
        profile: expect.objectContaining({
          connectionsCount: 3,
          connectionDateCounts: { '2026-08-10': 1 },
          connectionDateCountsComplete: true,
          connectionHistoryDatedCount: 1,
          connectionHistoryUndatedCount: 2,
          connectionHistoryBaselineCount: 3,
        }),
      },
      expect.objectContaining({ updatedAt: expect.any(Number) })
    );
  });

  it('finalizes an old terminal job from persisted chunks without restarting pagination', async () => {
    mocks.chunks.push({
      id: 'session_000000',
      accountKey: 'profile:example',
      sessionId: 'session',
      batchIndex: 0,
      startIndex: 0,
      records: [
        { id: 'a', connectedDate: '2026-08-10' },
        { id: 'b', connectedDate: '2026-08-09' },
      ],
      createdAt: collectedAt - 1,
    });

    const result = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      job: {
        ...job,
        status: 'running',
        batchIndex: 1,
        nextStartIndex: undefined,
        expectedTotal: 3,
        collectedCount: 2,
        error: 'LinkedIn returned 2 dated connections out of 3.',
      },
      collectedAt,
    });

    expect(result.complete).toBe(true);
    expect(result.job).toMatchObject({ status: 'complete', datedCount: 2, undatedCount: 1 });
    expect(mocks.getLinkedInCsrfToken).not.toHaveBeenCalled();
    expect(mocks.fetchLinkedInConnectionsSnapshot).not.toHaveBeenCalled();
  });

  it('still requests repair when terminal pagination produced no usable dates at all', async () => {
    mocks.fetchLinkedInConnectionsSnapshot.mockResolvedValue({
      connectionsCount: 3,
      connectionsCountExact: true,
      connectionDateCounts: {},
      connectionDateCountsComplete: false,
      connectionRecords: [],
      pagesFetched: 1,
      paginationComplete: true,
    });

    const result = await syncConnectionHistoryBatch({
      userId: 'user',
      linkedInTabId: 42,
      currentSnapshot,
      job,
      collectedAt,
    });

    expect(result.complete).toBe(false);
    expect(result.job).toMatchObject({ status: 'needs_repair', datedCount: 0, undatedCount: 3 });
    expect(result.error).toContain('no usable connection dates');
  });
});
