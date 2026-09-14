import { upsertProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsSnapshot } from 'shared/types';
import { hasSearchAppearancesChanged } from './profile-analytics-change-detector';
import { fetchSearchAppearancesSnapshot } from './profile-analytics-search-appearances-api';

export interface SearchAppearancesSyncResult {
  snapshot: ProfileAnalyticsSnapshot | null;
  collected: boolean;
  changed: boolean;
  sourceUrl?: string;
  error?: string;
}

/** Synchronizes Search Appearances without running profile metadata collectors. */
export async function syncSearchAppearancesMetric({
  userId,
  currentSnapshot,
  collectedAt = Date.now(),
}: {
  userId: string;
  currentSnapshot: ProfileAnalyticsSnapshot | null;
  collectedAt?: number;
}): Promise<SearchAppearancesSyncResult> {
  try {
    const searchAppearances = await fetchSearchAppearancesSnapshot(collectedAt);
    if (!searchAppearances || typeof searchAppearances.totalCount !== 'number') {
      throw new Error('LinkedIn Search Appearances response did not contain a total count.');
    }

    const changed = hasSearchAppearancesChanged(currentSnapshot?.searchAppearances, searchAppearances);
    const snapshot = changed
      ? await upsertProfileAnalyticsSnapshot(userId, { searchAppearances }, { updatedAt: collectedAt })
      : currentSnapshot;
    return {
      snapshot,
      collected: true,
      changed,
      sourceUrl: searchAppearances.sourceUrl,
    };
  } catch (error) {
    return {
      snapshot: currentSnapshot,
      collected: false,
      changed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
