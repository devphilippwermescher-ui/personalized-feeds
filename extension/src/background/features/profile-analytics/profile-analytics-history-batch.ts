import {
  setProfileAnalyticsConnectionHistoryJob,
  upsertProfileAnalyticsSnapshot,
  writeProfileAnalyticsConnectionHistoryChunk,
} from 'shared/firestore-service';
import type {
  ProfileAnalyticsConnectionHistoryJob,
  ProfileAnalyticsProfileSnapshot,
  ProfileAnalyticsSnapshot,
} from 'shared/types';
import { fetchLinkedInConnectionsSnapshot } from '../connections/api/connections-api';
import { getLinkedInCsrfToken } from '../../platform/linkedin/csrf-token';
import { completeConnectionHistoryFromChunks } from './profile-analytics-history-completion';
import {
  CONNECTION_HISTORY_AGGRESSIVE_BATCH_PAGE_LIMIT,
  CONNECTION_HISTORY_AGGRESSIVE_PAGE_DELAY_MS,
  CONNECTION_HISTORY_AUTOMATIC_RESTART_LIMIT,
  CONNECTION_HISTORY_CAUTIOUS_BATCH_PAGE_LIMIT,
  CONNECTION_HISTORY_CAUTIOUS_PAGE_DELAY_MS,
  createConnectionHistorySessionId,
  toConnectionHistoryBootstrap,
  type ConnectionHistoryBatchResult,
} from './profile-analytics-history-contracts';
import { restartConnectionHistoryBootstrap } from './profile-analytics-history-job';

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
    sessionId: inputJob.sessionId || createConnectionHistorySessionId(inputJob.accountKey, collectedAt),
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
      mode === 'aggressive' ? CONNECTION_HISTORY_AGGRESSIVE_PAGE_DELAY_MS : CONNECTION_HISTORY_CAUTIOUS_PAGE_DELAY_MS,
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
            connectionHistoryBootstrap: toConnectionHistoryBootstrap(restarted),
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
  }
  await setProfileAnalyticsConnectionHistoryJob(userId, job);

  const profile: ProfileAnalyticsProfileSnapshot = {
    ...currentSnapshot.profile,
    connectionsCount: expectedTotal,
    connectionsCountExact: true,
    connectionsCountUpdatedAt: collectedAt,
    connectionsCountSource: 'connections_rsc',
    connectionDateCountsComplete: false,
    connectionDateCountsError: job.error || '',
    connectionHistoryBootstrap: toConnectionHistoryBootstrap(job),
    updatedAt: collectedAt,
  };
  const snapshot = await upsertProfileAnalyticsSnapshot(userId, { profile }, { updatedAt: collectedAt });
  return { snapshot, job, complete: false, error: batch.error };
}
