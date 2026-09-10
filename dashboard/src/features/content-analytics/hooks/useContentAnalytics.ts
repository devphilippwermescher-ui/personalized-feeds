import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardAnalyticsSyncStatus } from 'shared/types';
import { sendMessageToExtension } from '../../../services/extension-messaging';
import {
  createEmptyContentAnalyticsCacheData,
  deleteContentAnalyticsCache,
  readContentAnalyticsCache,
  writeContentAnalyticsCache,
  type ContentAnalyticsCacheData,
} from '../services/content-analytics-cache';
import {
  loadContentAnalyticsFirestoreData,
  watchContentAnalyticsDailySnapshots,
  watchContentAnalyticsPosts,
  watchContentAnalyticsRanges,
  watchContentAnalyticsSnapshot,
  watchDashboardAnalyticsSyncManifest,
  type ContentAnalyticsWatchMetadata,
} from '../services/content-analytics-firestore';

const MAX_INITIAL_SKELETON_MS = 10_000;
const CACHE_WRITE_DEBOUNCE_MS = 150;
const SYNC_STATUS_POLL_MS = 5_000;
const CURRENT_SYNC_STATUS_MESSAGE = 'DASHBOARD_GET_ANALYTICS_SYNC_STATUS';
const LEGACY_SYNC_STATUS_MESSAGE = 'DASHBOARD_GET_PROFILE_ANALYTICS_SYNC_STATUS';

interface AnalyticsSyncStatusResponse {
  success: boolean;
  status?: DashboardAnalyticsSyncStatus | null;
  error?: string;
}

async function readExtensionSyncStatus(): Promise<AnalyticsSyncStatusResponse> {
  const currentResponse = await sendMessageToExtension<AnalyticsSyncStatusResponse>(
    { type: CURRENT_SYNC_STATUS_MESSAGE },
    { timeoutMs: 800 }
  );
  if (currentResponse.success) return currentResponse;

  // An already-installed extension may still expose only the pre-rename
  // bridge contract. Falling back keeps the dashboard from falsely claiming
  // that LinkedIn is disconnected while that extension is being reloaded.
  return sendMessageToExtension<AnalyticsSyncStatusResponse>(
    { type: LEGACY_SYNC_STATUS_MESSAGE },
    { timeoutMs: 2_200 }
  );
}

function shouldKeepCachedValue(
  metadata: ContentAnalyticsWatchMetadata | undefined,
  hasCachedValue: boolean,
  hasIncomingValue: boolean
): boolean {
  return metadata?.fromCache === true && hasCachedValue && !hasIncomingValue;
}

/**
 * Content Analytics is rendered cache-first.
 *
 * IndexedDB paints immediately, then Firestore subscriptions take over as the
 * authoritative source and refresh the cache. The dashboard never triggers a
 * LinkedIn request: `refresh` only re-reads the local cache and Firestore, and
 * the extension is polled for local sync status only.
 */
export function useContentAnalytics(userId: string) {
  const [data, setData] = useState<ContentAnalyticsCacheData>(createEmptyContentAnalyticsCacheData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<DashboardAnalyticsSyncStatus | null>(null);
  const [syncStatusError, setSyncStatusError] = useState<string | null>(null);
  const [syncStatusLoaded, setSyncStatusLoaded] = useState(false);
  const dataRef = useRef<ContentAnalyticsCacheData>(createEmptyContentAnalyticsCacheData());

  const applyData = useCallback((next: ContentAnalyticsCacheData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const cached = await readContentAnalyticsCache(userId);
      if (cached) applyData(cached);

      const firestoreData = await loadContentAnalyticsFirestoreData(userId);
      applyData(firestoreData);
      setError(null);
      await writeContentAnalyticsCache(userId, firestoreData);
    } catch (refreshError) {
      if (!dataRef.current.snapshot) {
        setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyData, userId]);

  useEffect(() => {
    let disposed = false;
    let cacheWriteTimeout: number | undefined;
    const unsubscribers: Array<() => void> = [];

    const scheduleCacheWrite = () => {
      window.clearTimeout(cacheWriteTimeout);
      cacheWriteTimeout = window.setTimeout(() => {
        if (!disposed) void writeContentAnalyticsCache(userId, dataRef.current);
      }, CACHE_WRITE_DEBOUNCE_MS);
    };
    const handleWatchError = (watchError: Error) => {
      if (!dataRef.current.snapshot) setError(watchError.message);
      setLoading(false);
    };
    const patch = (next: Partial<ContentAnalyticsCacheData>) => {
      applyData({ ...dataRef.current, ...next });
      setLoading(false);
      scheduleCacheWrite();
    };

    applyData(createEmptyContentAnalyticsCacheData());
    setLoading(true);
    setError(null);

    const timeoutId = window.setTimeout(() => setLoading(false), MAX_INITIAL_SKELETON_MS);

    void (async () => {
      const cached = await readContentAnalyticsCache(userId);
      if (disposed) return;
      if (cached) {
        applyData(cached);
        setLoading(false);
      }

      unsubscribers.push(
        watchContentAnalyticsSnapshot(
          userId,
          (snapshot, metadata) => {
            if (shouldKeepCachedValue(metadata, Boolean(dataRef.current.snapshot), Boolean(snapshot))) return;
            setError(null);
            patch({ snapshot });
          },
          handleWatchError
        ),
        watchContentAnalyticsRanges(
          userId,
          (ranges, metadata) => {
            if (shouldKeepCachedValue(metadata, dataRef.current.ranges.length > 0, ranges.length > 0)) return;
            patch({ ranges });
          },
          handleWatchError
        ),
        watchContentAnalyticsDailySnapshots(
          userId,
          (dailySnapshots, metadata) => {
            if (shouldKeepCachedValue(metadata, dataRef.current.dailySnapshots.length > 0, dailySnapshots.length > 0)) {
              return;
            }
            patch({ dailySnapshots });
          },
          handleWatchError
        ),
        watchContentAnalyticsPosts(
          userId,
          (posts, metadata) => {
            if (shouldKeepCachedValue(metadata, dataRef.current.posts.length > 0, posts.length > 0)) return;
            patch({ posts });
          },
          handleWatchError
        ),
        watchDashboardAnalyticsSyncManifest(
          userId,
          (syncManifest, metadata) => {
            if (shouldKeepCachedValue(metadata, Boolean(dataRef.current.syncManifest), Boolean(syncManifest))) {
              return;
            }
            patch({ syncManifest });
          },
          handleWatchError
        )
      );
    })();

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      window.clearTimeout(cacheWriteTimeout);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [applyData, userId]);

  useEffect(() => {
    let disposed = false;

    const readSyncStatus = async () => {
      const response = await readExtensionSyncStatus();
      if (disposed) return;
      if (response.success) {
        setSyncStatus(response.status || null);
        setSyncStatusError(null);
      } else {
        setSyncStatusError(response.error || 'myFeedPilot extension is not available.');
      }
      setSyncStatusLoaded(true);
    };

    setSyncStatus(null);
    setSyncStatusError(null);
    setSyncStatusLoaded(false);
    // Dashboard pages are read-only analytics consumers. Polling reads the
    // extension-local status for existing notices, but opening this page must
    // never queue LinkedIn collection work.
    void readSyncStatus();
    const intervalId = window.setInterval(() => void readSyncStatus(), SYNC_STATUS_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [userId]);

  return {
    ...data,
    loading,
    refreshing,
    error,
    syncStatus,
    syncStatusError,
    syncStatusLoaded,
    refresh,
    clearCache: () => deleteContentAnalyticsCache(userId),
  };
}
