import { upsertProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsSnapshot } from 'shared/types';
import { hasSocialSellingIndexChanged } from './profile-analytics-change-detector';
import { fetchSocialSellingIndexSnapshot } from './profile-analytics-ssi-api';
import type { ProfileAnalyticsSyncTrigger } from './profile-analytics-sync-policy';

const SSI_SYNC_DIAGNOSTICS_STORAGE_KEY = 'mfp_profile_analytics_ssi_diagnostics_v1';

export interface ProfileAnalyticsSsiSyncDiagnostics {
  userId: string;
  trigger: ProfileAnalyticsSyncTrigger;
  status: 'running' | 'success' | 'failed';
  lastAttemptAt: number;
  lastSuccessAt?: number;
  firestoreWrittenAt?: number;
  score?: number;
  sourceUrl?: string;
  error?: string;
}

interface SyncSocialSellingIndexOptions {
  userId: string;
  trigger: ProfileAnalyticsSyncTrigger;
  linkedInTabId?: number;
  currentSnapshot: ProfileAnalyticsSnapshot | null;
  collectedAt?: number;
}

export interface SyncSocialSellingIndexResult {
  snapshot: ProfileAnalyticsSnapshot | null;
  collected: boolean;
  changed: boolean;
  error?: string;
}

async function setDiagnostics(diagnostics: ProfileAnalyticsSsiSyncDiagnostics): Promise<void> {
  try {
    await chrome.storage.local.set({ [SSI_SYNC_DIAGNOSTICS_STORAGE_KEY]: diagnostics });
  } catch (error) {
    console.info('[profile-analytics] SSI diagnostics could not be persisted', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Synchronizes SSI independently from profile, connections, and followers.
 * A failure here never blocks the remaining Profile Analytics collectors.
 */
export async function syncSocialSellingIndexMetric({
  userId,
  trigger,
  linkedInTabId,
  currentSnapshot,
  collectedAt = Date.now(),
}: SyncSocialSellingIndexOptions): Promise<SyncSocialSellingIndexResult> {
  await setDiagnostics({ userId, trigger, status: 'running', lastAttemptAt: collectedAt });

  try {
    const socialSellingIndex = await fetchSocialSellingIndexSnapshot(collectedAt, linkedInTabId);
    if (!socialSellingIndex || typeof socialSellingIndex.score !== 'number') {
      throw new Error('LinkedIn SSI response did not contain memberScore.overall.');
    }

    const changed = hasSocialSellingIndexChanged(currentSnapshot?.socialSellingIndex, socialSellingIndex);
    const nextSnapshot = changed
      ? await upsertProfileAnalyticsSnapshot(userId, { socialSellingIndex }, { updatedAt: collectedAt })
      : currentSnapshot;
    const completedAt = Date.now();
    await setDiagnostics({
      userId,
      trigger,
      status: 'success',
      lastAttemptAt: collectedAt,
      lastSuccessAt: completedAt,
      firestoreWrittenAt: changed ? completedAt : undefined,
      score: socialSellingIndex.score,
      sourceUrl: socialSellingIndex.sourceUrl,
    });
    console.info('[profile-analytics] independent SSI sync completed', {
      trigger,
      score: socialSellingIndex.score,
      changed,
    });
    return { snapshot: nextSnapshot, collected: true, changed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setDiagnostics({
      userId,
      trigger,
      status: 'failed',
      lastAttemptAt: collectedAt,
      error: message,
    });
    console.warn('[profile-analytics] independent SSI sync failed', { trigger, error: message });
    return { snapshot: currentSnapshot, collected: false, changed: false, error: message };
  }
}
