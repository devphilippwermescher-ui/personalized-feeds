import {
  getProfileAnalyticsConnectionHistoryChunks,
  setProfileAnalyticsConnectionHistoryJob,
  upsertProfileAnalyticsSnapshot,
} from 'shared/firestore-service';
import type {
  ProfileAnalyticsConnectionHistoryJob,
  ProfileAnalyticsProfileSnapshot,
  ProfileAnalyticsSnapshot,
} from 'shared/types';
import {
  RECENT_CONNECTION_IDS_LIMIT,
  toConnectionHistoryBootstrap,
  type ConnectionHistoryBatchResult,
} from './profile-analytics-history-contracts';

function countDatesByConnection(connectionDatesById: Map<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  connectionDatesById.forEach((date) => {
    counts[date] = (counts[date] || 0) + 1;
  });
  return counts;
}

export async function completeConnectionHistoryFromChunks({
  userId,
  currentSnapshot,
  job: inputJob,
  expectedTotal,
  collectedAt,
}: {
  userId: string;
  currentSnapshot: ProfileAnalyticsSnapshot;
  job: ProfileAnalyticsConnectionHistoryJob;
  expectedTotal: number;
  collectedAt: number;
}): Promise<ConnectionHistoryBatchResult> {
  if (!currentSnapshot.profile || !inputJob.sessionId) {
    throw new Error('Connections history chunks cannot be completed without a profile and session.');
  }

  const chunks = await getProfileAnalyticsConnectionHistoryChunks(userId, inputJob.sessionId);
  const connectionDatesById = new Map<string, string>();
  chunks.forEach((chunk) => {
    chunk.records.forEach((record) => connectionDatesById.set(record.id, record.connectedDate));
  });
  const datedCount = connectionDatesById.size;
  const undatedCount = Math.max(0, expectedTotal - datedCount);
  const completedAt = Date.now();
  if (expectedTotal > 0 && datedCount === 0) {
    const error = `LinkedIn history pagination finished, but no usable connection dates were found for ${expectedTotal} connections.`;
    const job: ProfileAnalyticsConnectionHistoryJob = {
      ...inputJob,
      status: 'needs_repair',
      expectedTotal,
      collectedCount: 0,
      datedCount: 0,
      undatedCount: expectedTotal,
      nextStartIndex: undefined,
      nextRetryAt: undefined,
      error,
      updatedAt: completedAt,
    };
    await setProfileAnalyticsConnectionHistoryJob(userId, job);
    const snapshot = await upsertProfileAnalyticsSnapshot(
      userId,
      {
        profile: {
          ...currentSnapshot.profile,
          connectionsCount: expectedTotal,
          connectionsCountExact: true,
          connectionsCountUpdatedAt: collectedAt,
          connectionsCountSource: 'connections_rsc',
          connectionDateCountsComplete: false,
          connectionDateCountsError: error,
          connectionHistoryBootstrap: toConnectionHistoryBootstrap(job),
          updatedAt: completedAt,
        },
      },
      { updatedAt: completedAt }
    );
    return { snapshot, job, complete: false, error };
  }

  const job: ProfileAnalyticsConnectionHistoryJob = {
    ...inputJob,
    status: 'complete',
    expectedTotal,
    collectedCount: datedCount,
    datedCount,
    undatedCount,
    completedAt,
    nextStartIndex: undefined,
    nextRetryAt: undefined,
    error: undefined,
    updatedAt: completedAt,
  };
  await setProfileAnalyticsConnectionHistoryJob(userId, job);

  const profile: ProfileAnalyticsProfileSnapshot = {
    ...currentSnapshot.profile,
    connectionsCount: expectedTotal,
    connectionsCountExact: true,
    connectionsCountUpdatedAt: collectedAt,
    connectionsCountSource: 'connections_rsc',
    connectionDateCounts: countDatesByConnection(connectionDatesById),
    // Completeness describes successful traversal of the history, not whether
    // every LinkedIn row exposed a parseable identity/date pair.
    connectionDateCountsComplete: true,
    connectionHistoryDatedCount: datedCount,
    connectionHistoryUndatedCount: undatedCount,
    connectionDateCountsUpdatedAt: completedAt,
    connectionDateCountsError: '',
    connectionHistoryKind: 'backfilled_current_connections',
    connectionHistoryBootstrap: toConnectionHistoryBootstrap(job),
    connectionHistoryBaselineAt: completedAt,
    connectionHistoryBaselineCount: expectedTotal,
    connectionHistoryAccountKey: job.accountKey,
    connectionIncrementalStatus: 'current',
    recentConnectionIds: Array.from(connectionDatesById.keys()).slice(0, RECENT_CONNECTION_IDS_LIMIT),
    updatedAt: completedAt,
  };
  const snapshot = await upsertProfileAnalyticsSnapshot(userId, { profile }, { updatedAt: completedAt });
  return { snapshot, job, complete: true };
}

/** Restores the current snapshot marker from an already completed server job. */
export async function reconcileCompletedConnectionHistory({
  userId,
  currentSnapshot,
  job,
  now = Date.now(),
}: {
  userId: string;
  currentSnapshot: ProfileAnalyticsSnapshot;
  job: ProfileAnalyticsConnectionHistoryJob;
  now?: number;
}): Promise<ProfileAnalyticsSnapshot> {
  if (!currentSnapshot.profile || job.status !== 'complete') {
    return currentSnapshot;
  }
  if (currentSnapshot.profile.connectionDateCountsComplete === true) {
    return upsertProfileAnalyticsSnapshot(
      userId,
      {
        profile: {
          ...currentSnapshot.profile,
          connectionDateCountsError: '',
          connectionHistoryBootstrap: toConnectionHistoryBootstrap(job),
          connectionHistoryBaselineAt: currentSnapshot.profile.connectionHistoryBaselineAt || job.completedAt || now,
          connectionHistoryBaselineCount:
            currentSnapshot.profile.connectionHistoryBaselineCount ||
            job.expectedTotal ||
            currentSnapshot.profile.connectionsCount,
          connectionHistoryAccountKey: job.accountKey,
        },
      },
      { updatedAt: now }
    ) as Promise<ProfileAnalyticsSnapshot>;
  }
  if (!job.sessionId || typeof job.expectedTotal !== 'number') {
    throw new Error('Completed Connections history is missing its persisted session metadata.');
  }
  return (
    await completeConnectionHistoryFromChunks({
      userId,
      currentSnapshot,
      job,
      expectedTotal: job.expectedTotal,
      collectedAt: now,
    })
  ).snapshot;
}
