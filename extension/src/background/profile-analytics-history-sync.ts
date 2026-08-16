import {
  getProfileAnalyticsConnectionAccountKey,
  getProfileAnalyticsConnectionHistoryChunks,
  getProfileAnalyticsConnectionHistoryJob,
  getProfileAnalyticsConnectionHistoryJobId,
  PROFILE_ANALYTICS_CONNECTION_HISTORY_VERSION,
  setProfileAnalyticsConnectionHistoryJob,
  upsertProfileAnalyticsSnapshot,
  writeProfileAnalyticsConnectionHistoryChunk,
} from 'shared/firestore-service';
import type {
  ProfileAnalyticsConnectionHistoryBootstrap,
  ProfileAnalyticsConnectionHistoryJob,
  ProfileAnalyticsProfileSnapshot,
  ProfileAnalyticsSnapshot,
} from 'shared/types';
import { fetchLinkedInConnectionsSnapshot } from './linkedin-connections-api';
import { getLinkedInCsrfToken } from './profile-viewers-api-client';

export const CONNECTION_HISTORY_AGGRESSIVE_BATCH_PAGE_LIMIT = 20;
export const CONNECTION_HISTORY_CAUTIOUS_BATCH_PAGE_LIMIT = 10;
export const CONNECTION_HISTORY_AGGRESSIVE_PAGE_DELAY_MS = 1_125;
export const CONNECTION_HISTORY_CAUTIOUS_PAGE_DELAY_MS = 2_500;
const CONNECTION_HISTORY_AUTOMATIC_RESTART_LIMIT = 1;
const RECENT_CONNECTION_IDS_LIMIT = 100;

export interface ConnectionHistoryBatchResult {
  snapshot: ProfileAnalyticsSnapshot;
  job: ProfileAnalyticsConnectionHistoryJob;
  complete: boolean;
  error?: string;
}

function createSessionId(accountKey: string, now: number): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${now.toString(36)}_${random}_${accountKey.length.toString(36)}`;
}

function toBootstrap(job: ProfileAnalyticsConnectionHistoryJob): ProfileAnalyticsConnectionHistoryBootstrap {
  return {
    version: PROFILE_ANALYTICS_CONNECTION_HISTORY_VERSION,
    accountKey: job.accountKey,
    status: job.status,
    sessionId: job.sessionId,
    expectedTotal: job.expectedTotal,
    collectedCount: job.collectedCount,
    datedCount: job.datedCount,
    undatedCount: job.undatedCount,
    nextStartIndex: job.nextStartIndex,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    lastAttemptAt: job.lastAttemptAt,
    nextRetryAt: job.nextRetryAt,
    mode: job.mode,
    batchesSinceCooldown: job.batchesSinceCooldown,
    error: job.error,
  };
}

function countDatesByConnection(connectionDatesById: Map<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  connectionDatesById.forEach((date) => {
    counts[date] = (counts[date] || 0) + 1;
  });
  return counts;
}

async function completeConnectionHistoryFromChunks({
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
          connectionHistoryBootstrap: toBootstrap(job),
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
    connectionHistoryBootstrap: toBootstrap(job),
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

export async function ensureConnectionHistoryBootstrapJob({
  userId,
  profile,
  now = Date.now(),
}: {
  userId: string;
  profile: ProfileAnalyticsProfileSnapshot;
  now?: number;
}): Promise<ProfileAnalyticsConnectionHistoryJob> {
  const accountKey = getProfileAnalyticsConnectionAccountKey(profile);
  const existing = await getProfileAnalyticsConnectionHistoryJob(userId, accountKey);
  if (existing) {
    // Older builds represented "history has never started" as needs_repair
    // without a session. That state cannot be resumed and is not a damaged
    // import, so upgrade it in place to a real first-run bootstrap.
    if (existing.status === 'needs_repair' && !existing.sessionId) {
      const scheduled: ProfileAnalyticsConnectionHistoryJob = {
        ...existing,
        status: 'scheduled',
        sessionId: createSessionId(accountKey, now),
        expectedTotal: profile.connectionsCountExact === true ? profile.connectionsCount : undefined,
        collectedCount: 0,
        nextStartIndex: 0,
        batchIndex: 0,
        mode: 'aggressive',
        batchesSinceCooldown: 0,
        nextRetryAt: undefined,
        error: undefined,
        updatedAt: now,
      };
      await setProfileAnalyticsConnectionHistoryJob(userId, scheduled);
      await upsertProfileAnalyticsSnapshot(
        userId,
        {
          profile: {
            ...profile,
            connectionDateCountsComplete: false,
            connectionDateCountsError: '',
            connectionHistoryBootstrap: toBootstrap(scheduled),
          },
        },
        { updatedAt: now }
      );
      return scheduled;
    }
    return existing;
  }

  const completeLegacyHistory = profile.connectionDateCountsComplete === true;
  const status = completeLegacyHistory ? 'complete' : 'scheduled';
  const job: ProfileAnalyticsConnectionHistoryJob = {
    id: getProfileAnalyticsConnectionHistoryJobId(accountKey),
    version: PROFILE_ANALYTICS_CONNECTION_HISTORY_VERSION,
    accountKey,
    status,
    restartCount: 0,
    batchIndex: 0,
    mode: 'aggressive',
    batchesSinceCooldown: 0,
    updatedAt: now,
    ...(completeLegacyHistory
      ? {
          expectedTotal: profile.connectionsCount,
          collectedCount: profile.connectionsCount,
          completedAt: profile.connectionDateCountsUpdatedAt || now,
        }
      : {
          sessionId: createSessionId(accountKey, now),
          expectedTotal: profile.connectionsCountExact === true ? profile.connectionsCount : undefined,
          collectedCount: 0,
          nextStartIndex: 0,
        }),
  };
  await setProfileAnalyticsConnectionHistoryJob(userId, job);
  await upsertProfileAnalyticsSnapshot(
    userId,
    {
      profile: {
        ...profile,
        connectionHistoryBootstrap: toBootstrap(job),
        ...(completeLegacyHistory
          ? {
              connectionHistoryBaselineAt: job.completedAt,
              connectionHistoryBaselineCount: profile.connectionsCount,
              connectionHistoryAccountKey: accountKey,
            }
          : {
              connectionDateCountsComplete: false,
              connectionDateCountsError: '',
            }),
      },
    },
    { updatedAt: now }
  );
  return job;
}

export async function restartConnectionHistoryBootstrap({
  userId,
  profile,
  now = Date.now(),
}: {
  userId: string;
  profile: ProfileAnalyticsProfileSnapshot;
  now?: number;
}): Promise<ProfileAnalyticsConnectionHistoryJob> {
  const accountKey = getProfileAnalyticsConnectionAccountKey(profile);
  const previous = await getProfileAnalyticsConnectionHistoryJob(userId, accountKey);
  const job: ProfileAnalyticsConnectionHistoryJob = {
    id: getProfileAnalyticsConnectionHistoryJobId(accountKey),
    version: PROFILE_ANALYTICS_CONNECTION_HISTORY_VERSION,
    accountKey,
    status: 'scheduled',
    sessionId: createSessionId(accountKey, now),
    nextStartIndex: 0,
    restartCount: (previous?.restartCount || 0) + 1,
    batchIndex: 0,
    mode: 'aggressive',
    batchesSinceCooldown: 0,
    updatedAt: now,
  };
  await setProfileAnalyticsConnectionHistoryJob(userId, job);
  await upsertProfileAnalyticsSnapshot(
    userId,
    {
      profile: {
        ...profile,
        connectionDateCountsComplete: false,
        connectionDateCountsError: '',
        connectionHistoryBootstrap: toBootstrap(job),
      },
    },
    { updatedAt: now }
  );
  return job;
}

/**
 * Resumes an existing bootstrap without replacing its session or deleting any
 * persisted chunks. When an old repair state lost its cursor, the last stored
 * batch is fetched once more; final aggregation de-duplicates records by id.
 */
export async function resumeConnectionHistoryBootstrap({
  userId,
  profile,
  now = Date.now(),
}: {
  userId: string;
  profile: ProfileAnalyticsProfileSnapshot;
  now?: number;
}): Promise<ProfileAnalyticsConnectionHistoryJob> {
  const accountKey = getProfileAnalyticsConnectionAccountKey(profile);
  const existing = await getProfileAnalyticsConnectionHistoryJob(userId, accountKey);
  if (!existing) {
    throw new Error('No saved Connections history checkpoint exists for this account.');
  }
  if (existing.status === 'complete') {
    return existing;
  }
  if (!existing.sessionId) {
    throw new Error('This Connections history has no resumable session. A new import was not started.');
  }

  const chunks = await getProfileAnalyticsConnectionHistoryChunks(userId, existing.sessionId);
  const lastChunk = chunks.length > 0 ? chunks[chunks.length - 1] : undefined;
  const nextStartIndex =
    typeof existing.nextStartIndex === 'number' ? existing.nextStartIndex : lastChunk?.startIndex;
  if (typeof nextStartIndex !== 'number') {
    throw new Error('This Connections history has no resumable cursor. A new import was not started.');
  }

  const job: ProfileAnalyticsConnectionHistoryJob = {
    ...existing,
    status: 'scheduled',
    nextStartIndex,
    // A user-requested resume must never fall through to the automatic
    // restart-from-zero branch when LinkedIn's current total changed while
    // this saved import was paused.
    restartCount: Math.max(existing.restartCount, CONNECTION_HISTORY_AUTOMATIC_RESTART_LIMIT),
    mode: existing.mode || 'cautious',
    nextRetryAt: undefined,
    error: undefined,
    updatedAt: now,
  };
  await setProfileAnalyticsConnectionHistoryJob(userId, job);
  await upsertProfileAnalyticsSnapshot(
    userId,
    {
      profile: {
        ...profile,
        connectionDateCountsError: '',
        connectionHistoryBootstrap: toBootstrap(job),
      },
    },
    { updatedAt: now }
  );
  return job;
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
          connectionHistoryBootstrap: toBootstrap(job),
          connectionHistoryBaselineAt:
            currentSnapshot.profile.connectionHistoryBaselineAt || job.completedAt || now,
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

export async function syncConnectionHistoryBatch({
  userId,
  linkedInTabId,
  currentSnapshot,
  job: inputJob,
  collectedAt = Date.now(),
}: {
  userId: string;
  linkedInTabId: number;
  currentSnapshot: ProfileAnalyticsSnapshot;
  job: ProfileAnalyticsConnectionHistoryJob;
  collectedAt?: number;
}): Promise<ConnectionHistoryBatchResult> {
  if (!currentSnapshot.profile) {
    throw new Error('Current profile analytics must be collected before connection history.');
  }

  // Builds created before coverage-aware completion already persisted every
  // terminal chunk but left the cursor empty with a reconciliation error.
  // Finalize those chunks locally so a manual resume does not restart LinkedIn
  // pagination from zero.
  if (
    inputJob.status !== 'complete' &&
    inputJob.status !== 'needs_repair' &&
    inputJob.sessionId &&
    inputJob.batchIndex > 0 &&
    inputJob.nextStartIndex === undefined &&
    typeof inputJob.expectedTotal === 'number'
  ) {
    return completeConnectionHistoryFromChunks({
      userId,
      currentSnapshot,
      job: inputJob,
      expectedTotal: inputJob.expectedTotal,
      collectedAt,
    });
  }

  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) throw new Error('LinkedIn CSRF token is unavailable.');

  let job: ProfileAnalyticsConnectionHistoryJob = {
    ...inputJob,
    status: 'running',
    sessionId: inputJob.sessionId || createSessionId(inputJob.accountKey, collectedAt),
    startedAt: inputJob.startedAt || collectedAt,
    lastAttemptAt: collectedAt,
    nextRetryAt: undefined,
    error: undefined,
    updatedAt: collectedAt,
  };
  await setProfileAnalyticsConnectionHistoryJob(userId, job);

  const startIndex = job.nextStartIndex || 0;
  const mode = job.mode || 'aggressive';
  const batch = await fetchLinkedInConnectionsSnapshot(csrfToken, linkedInTabId, {
    includeHistory: true,
    maxPages:
      mode === 'aggressive'
        ? CONNECTION_HISTORY_AGGRESSIVE_BATCH_PAGE_LIMIT
        : CONNECTION_HISTORY_CAUTIOUS_BATCH_PAGE_LIMIT,
    startIndex,
    paginationDelayMs:
      mode === 'aggressive'
        ? CONNECTION_HISTORY_AGGRESSIVE_PAGE_DELAY_MS
        : CONNECTION_HISTORY_CAUTIOUS_PAGE_DELAY_MS,
    // The coordinator owns inter-batch cooldowns. The injected collector must
    // not add its legacy one-minute pause in the middle of a bootstrap batch.
    paginationBatchSize: 0,
    requestTimeoutMs: mode === 'aggressive' ? 12_000 : 10_000,
    workTimeoutMs: mode === 'aggressive' ? 70_000 : 40_000,
    scriptTimeoutMs: mode === 'aggressive' ? 75_000 : 45_000,
  });
  if (typeof batch.connectionsCount !== 'number' || batch.connectionsCountExact !== true) {
    throw new Error(batch.error || 'LinkedIn did not return an exact Connections total for history.');
  }

  const expectedTotal = batch.connectionsCount;
  if (typeof job.expectedTotal === 'number' && job.expectedTotal !== expectedTotal && startIndex > 0) {
    const diagnostic = `Connections total changed from ${job.expectedTotal} to ${expectedTotal} during history import.`;
    const restarted =
      job.restartCount < CONNECTION_HISTORY_AUTOMATIC_RESTART_LIMIT
        ? await restartConnectionHistoryBootstrap({
            userId,
            profile: currentSnapshot.profile,
            now: collectedAt,
          })
        : {
            ...job,
            status: 'needs_repair' as const,
            expectedTotal,
            nextStartIndex: undefined,
            error: diagnostic,
            updatedAt: collectedAt,
          };
    if (restarted.status === 'needs_repair') {
      await setProfileAnalyticsConnectionHistoryJob(userId, restarted);
    }
    return {
      snapshot: (await upsertProfileAnalyticsSnapshot(
        userId,
        {
          profile: {
            ...currentSnapshot.profile,
            connectionsCount: expectedTotal,
            connectionsCountExact: true,
            connectionsCountUpdatedAt: collectedAt,
            connectionsCountSource: 'connections_rsc',
            connectionDateCountsComplete: false,
            connectionDateCountsError: restarted.status === 'needs_repair' ? diagnostic : '',
            connectionHistoryBootstrap: toBootstrap(restarted),
          },
        },
        { updatedAt: collectedAt }
      )) as ProfileAnalyticsSnapshot,
      job: restarted,
      complete: false,
    };
  }

  const records = batch.connectionRecords || [];
  const chunkId = `${job.sessionId}_${job.batchIndex.toString().padStart(6, '0')}`;
  await writeProfileAnalyticsConnectionHistoryChunk(userId, {
    id: chunkId,
    accountKey: job.accountKey,
    sessionId: job.sessionId!,
    batchIndex: job.batchIndex,
    startIndex,
    records,
    createdAt: collectedAt,
  });

  const nextStartIndex = batch.nextStartIndex || startIndex + (batch.pagesFetched || 0) * 10;
  job = {
    ...job,
    expectedTotal,
    collectedCount: (job.collectedCount || 0) + records.length,
    nextStartIndex: batch.paginationComplete ? undefined : nextStartIndex,
    batchIndex: job.batchIndex + 1,
    mode: batch.error ? 'cautious' : mode,
    batchesSinceCooldown: batch.error ? 0 : (job.batchesSinceCooldown || 0) + 1,
    error: batch.error,
    updatedAt: collectedAt,
  };

  if (batch.paginationComplete === true && !batch.error) {
    return completeConnectionHistoryFromChunks({
      userId,
      currentSnapshot,
      job,
      expectedTotal,
      collectedAt,
    });
  } else {
    await setProfileAnalyticsConnectionHistoryJob(userId, job);
  }

  const profile: ProfileAnalyticsProfileSnapshot = {
    ...currentSnapshot.profile,
    connectionsCount: expectedTotal,
    connectionsCountExact: true,
    connectionsCountUpdatedAt: collectedAt,
    connectionsCountSource: 'connections_rsc',
    connectionDateCountsComplete: false,
    connectionDateCountsError: job.error || '',
    connectionHistoryBootstrap: toBootstrap(job),
    updatedAt: collectedAt,
  };
  const snapshot = await upsertProfileAnalyticsSnapshot(userId, { profile }, { updatedAt: collectedAt });
  return { snapshot, job, complete: false, error: batch.error };
}
