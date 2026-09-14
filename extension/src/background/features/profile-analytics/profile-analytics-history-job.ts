import {
  getProfileAnalyticsConnectionAccountKey,
  getProfileAnalyticsConnectionHistoryChunks,
  getProfileAnalyticsConnectionHistoryJob,
  getProfileAnalyticsConnectionHistoryJobId,
  PROFILE_ANALYTICS_CONNECTION_HISTORY_VERSION,
  setProfileAnalyticsConnectionHistoryJob,
  upsertProfileAnalyticsSnapshot,
} from 'shared/firestore-service';
import type { ProfileAnalyticsConnectionHistoryJob, ProfileAnalyticsProfileSnapshot } from 'shared/types';
import {
  CONNECTION_HISTORY_AUTOMATIC_RESTART_LIMIT,
  createConnectionHistorySessionId,
  toConnectionHistoryBootstrap,
} from './profile-analytics-history-contracts';

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
        sessionId: createConnectionHistorySessionId(accountKey, now),
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
            connectionHistoryBootstrap: toConnectionHistoryBootstrap(scheduled),
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
          sessionId: createConnectionHistorySessionId(accountKey, now),
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
        connectionHistoryBootstrap: toConnectionHistoryBootstrap(job),
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
    sessionId: createConnectionHistorySessionId(accountKey, now),
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
        connectionHistoryBootstrap: toConnectionHistoryBootstrap(job),
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
  const nextStartIndex = typeof existing.nextStartIndex === 'number' ? existing.nextStartIndex : lastChunk?.startIndex;
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
        connectionHistoryBootstrap: toConnectionHistoryBootstrap(job),
      },
    },
    { updatedAt: now }
  );
  return job;
}
