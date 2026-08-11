import { upsertProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsProfileSnapshot, ProfileAnalyticsSnapshot } from 'shared/types';
import { fetchLinkedInConnectionsSnapshot } from './linkedin-connections-api';
import { getLinkedInCsrfToken } from './profile-viewers-api-client';
import type { ProfileAnalyticsConnectionHistoryCheckpoint } from './profile-analytics-sync-policy';

export const CONNECTION_HISTORY_BATCH_PAGE_LIMIT = 10;
const RECENT_CONNECTION_IDS_LIMIT = 100;

export interface ConnectionHistoryBatchResult {
  snapshot: ProfileAnalyticsSnapshot;
  checkpoint?: ProfileAnalyticsConnectionHistoryCheckpoint;
  complete: boolean;
  error?: string;
}

function countDatesByConnection(connectionDatesById: Record<string, string>): Record<string, number> {
  return Object.values(connectionDatesById).reduce<Record<string, number>>((counts, date) => {
    counts[date] = (counts[date] || 0) + 1;
    return counts;
  }, {});
}

function mergeRecentIds(current: string[], incoming: string[]): string[] {
  return Array.from(new Set([...current, ...incoming])).slice(0, RECENT_CONNECTION_IDS_LIMIT);
}

export async function syncConnectionHistoryBatch({
  userId,
  linkedInTabId,
  currentSnapshot,
  checkpoint,
  collectedAt = Date.now(),
}: {
  userId: string;
  linkedInTabId: number;
  currentSnapshot: ProfileAnalyticsSnapshot;
  checkpoint?: ProfileAnalyticsConnectionHistoryCheckpoint;
  collectedAt?: number;
}): Promise<ConnectionHistoryBatchResult> {
  if (!currentSnapshot.profile) {
    throw new Error('Current profile analytics must be collected before connection history.');
  }
  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) throw new Error('LinkedIn CSRF token is unavailable.');

  const startIndex = checkpoint?.nextStartIndex || 0;
  const batch = await fetchLinkedInConnectionsSnapshot(csrfToken, linkedInTabId, {
    includeHistory: true,
    maxPages: CONNECTION_HISTORY_BATCH_PAGE_LIMIT,
    startIndex,
  });
  if (typeof batch.connectionsCount !== 'number' || batch.connectionsCountExact !== true) {
    throw new Error(batch.error || 'LinkedIn did not return an exact Connections total for history.');
  }

  const expectedTotal = batch.connectionsCount;
  const checkpointMatchesTotal = !checkpoint || checkpoint.expectedTotal === expectedTotal;
  const connectionDatesById = checkpointMatchesTotal ? { ...(checkpoint?.connectionDatesById || {}) } : {};
  const recentConnectionIds = checkpointMatchesTotal ? [...(checkpoint?.recentConnectionIds || [])] : [];

  // If the total changed while a later batch was running, restart from page
  // zero on the next alarm so pages from different list versions are not mixed.
  const mustRestart = Boolean(checkpoint && !checkpointMatchesTotal && startIndex > 0);
  if (!mustRestart) {
    for (const record of batch.connectionRecords || []) {
      connectionDatesById[record.id] = record.connectedDate;
    }
  }
  const mergedRecentIds = mergeRecentIds(recentConnectionIds, batch.recentConnectionIds || []);
  const collectedUniqueCount = Object.keys(connectionDatesById).length;
  const complete =
    !mustRestart && !batch.error && batch.paginationComplete === true && collectedUniqueCount === expectedTotal;
  const nextStartIndex = mustRestart ? 0 : batch.nextStartIndex || startIndex + (batch.pagesFetched || 0) * 10;
  const diagnostic =
    batch.error ||
    (complete ? undefined : `LinkedIn returned ${collectedUniqueCount} dated connections out of ${expectedTotal}.`);

  const currentProfile = currentSnapshot.profile;
  const profile: ProfileAnalyticsProfileSnapshot = {
    ...currentProfile,
    connectionsCount: expectedTotal,
    connectionsCountExact: true,
    connectionsCountUpdatedAt: collectedAt,
    connectionsCountSource: 'connections_rsc',
    connectionDateCounts: complete ? countDatesByConnection(connectionDatesById) : currentProfile.connectionDateCounts,
    connectionDateCountsComplete: complete,
    connectionDateCountsUpdatedAt: complete ? collectedAt : currentProfile.connectionDateCountsUpdatedAt,
    connectionDateCountsError: diagnostic || '',
    connectionHistoryKind: complete ? 'backfilled_current_connections' : currentProfile.connectionHistoryKind,
    recentConnectionIds: mergedRecentIds.length > 0 ? mergedRecentIds : currentProfile.recentConnectionIds,
    updatedAt: collectedAt,
  };
  const snapshot = await upsertProfileAnalyticsSnapshot(userId, { profile }, { updatedAt: collectedAt });

  if (complete) return { snapshot, complete: true };
  return {
    snapshot,
    complete: false,
    error: batch.error,
    checkpoint: {
      version: 1,
      expectedTotal,
      nextStartIndex,
      connectionDatesById,
      recentConnectionIds: mergedRecentIds,
      collectedUniqueCount,
      lastAttemptAt: collectedAt,
      status: batch.error ? 'failed' : 'pending',
      ...(diagnostic ? { error: diagnostic } : {}),
    },
  };
}
