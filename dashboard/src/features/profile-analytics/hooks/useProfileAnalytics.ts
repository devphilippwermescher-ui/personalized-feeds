import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProfileAnalyticsConnectionInvite,
  ProfileAnalyticsDailySnapshot,
  ProfileAnalyticsSnapshot,
  ProfileViewer,
  ProfileViewerSummary,
  ProfileAnalyticsSyncStatus,
} from 'shared/types';
import { sendMessageToExtension } from '../../../utils/extensionMessaging';
import {
  deleteProfileAnalyticsCache,
  readProfileAnalyticsCache,
  writeProfileAnalyticsCache,
  type ProfileAnalyticsCacheData,
} from '../services/profile-analytics-cache';
import {
  loadCurrentProfileAnalyticsSnapshot,
  loadProfileAnalyticsSupportingData,
  watchConnectionInvites,
  watchProfileAnalyticsDailySnapshots,
  watchProfileAnalyticsSnapshot,
  watchProfileViewers,
  watchProfileViewerSummary,
  type ProfileAnalyticsWatchMetadata,
} from '../services/profile-analytics-firestore';

const MAX_INITIAL_SKELETON_MS = 10_000;
const CACHE_WRITE_DEBOUNCE_MS = 150;

function createEmptyAnalyticsData(): ProfileAnalyticsCacheData {
  return {
    snapshot: null,
    dailySnapshots: [],
    profileViewers: [],
    profileViewerSummary: null,
    connectionInvites: [],
  };
}

function shouldKeepCachedValue(
  metadata: ProfileAnalyticsWatchMetadata | undefined,
  hasCachedValue: boolean,
  hasIncomingValue: boolean
): boolean {
  return metadata?.fromCache === true && hasCachedValue && !hasIncomingValue;
}

/**
 * Profile Analytics is rendered cache-first. Firestore remains authoritative:
 * its live subscriptions replace the local IndexedDB snapshot and refresh that
 * cache whenever server data changes. The dashboard never starts LinkedIn work.
 */
export function useProfileAnalytics(userId: string) {
  const [snapshot, setSnapshot] = useState<ProfileAnalyticsSnapshot | null>(null);
  const [dailySnapshots, setDailySnapshots] = useState<ProfileAnalyticsDailySnapshot[]>([]);
  const [profileViewers, setProfileViewers] = useState<ProfileViewer[]>([]);
  const [profileViewerSummary, setProfileViewerSummary] = useState<ProfileViewerSummary | null>(null);
  const [connectionInvites, setConnectionInvites] = useState<ProfileAnalyticsConnectionInvite[]>([]);
  const [supportingDataLoaded, setSupportingDataLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<ProfileAnalyticsSyncStatus | null>(null);
  const [syncStatusError, setSyncStatusError] = useState<string | null>(null);
  const [syncStatusLoaded, setSyncStatusLoaded] = useState(false);
  const dataRef = useRef<ProfileAnalyticsCacheData>(createEmptyAnalyticsData());

  const refresh = useCallback(async () => {
    try {
      const [currentSnapshot, supportingData] = await Promise.all([
        loadCurrentProfileAnalyticsSnapshot(userId),
        loadProfileAnalyticsSupportingData(userId),
      ]);
      const nextData = { snapshot: currentSnapshot, ...supportingData };
      dataRef.current = nextData;
      setSnapshot(nextData.snapshot);
      setDailySnapshots(nextData.dailySnapshots);
      setProfileViewers(nextData.profileViewers);
      setProfileViewerSummary(nextData.profileViewerSummary);
      setConnectionInvites(nextData.connectionInvites);
      setSupportingDataLoaded(true);
      setLoading(false);
      setError(null);
      await writeProfileAnalyticsCache(userId, nextData);
    } catch (refreshError) {
      if (!dataRef.current.snapshot) {
        setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      }
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let disposed = false;
    let cacheWriteTimeout: number | undefined;
    const unsubscribers: Array<() => void> = [];
    const liveSupportingSections = {
      dailySnapshots: false,
      profileViewers: false,
      profileViewerSummary: false,
      connectionInvites: false,
    };

    const scheduleCacheWrite = () => {
      window.clearTimeout(cacheWriteTimeout);
      cacheWriteTimeout = window.setTimeout(() => {
        if (!disposed) void writeProfileAnalyticsCache(userId, dataRef.current);
      }, CACHE_WRITE_DEBOUNCE_MS);
    };
    const markSupportingSectionLoaded = (section: keyof typeof liveSupportingSections) => {
      liveSupportingSections[section] = true;
      if (Object.values(liveSupportingSections).every(Boolean)) setSupportingDataLoaded(true);
    };
    const handleWatchError = (watchError: Error) => {
      if (!dataRef.current.snapshot) setError(watchError.message);
      setLoading(false);
    };

    setSnapshot(null);
    setDailySnapshots([]);
    setProfileViewers([]);
    setProfileViewerSummary(null);
    setConnectionInvites([]);
    setSupportingDataLoaded(false);
    setLoading(true);
    setError(null);
    dataRef.current = createEmptyAnalyticsData();

    const timeoutId = window.setTimeout(() => setLoading(false), MAX_INITIAL_SKELETON_MS);

    void (async () => {
      const cachedData = await readProfileAnalyticsCache(userId);
      if (disposed) return;
      if (cachedData) {
        dataRef.current = cachedData;
        setSnapshot(cachedData.snapshot);
        setDailySnapshots(cachedData.dailySnapshots);
        setProfileViewers(cachedData.profileViewers);
        setProfileViewerSummary(cachedData.profileViewerSummary);
        setConnectionInvites(cachedData.connectionInvites);
        setSupportingDataLoaded(true);
        setLoading(false);
      }

      unsubscribers.push(
        watchProfileAnalyticsSnapshot(
          userId,
          (nextSnapshot, metadata) => {
            if (
              shouldKeepCachedValue(metadata, Boolean(dataRef.current.snapshot), Boolean(nextSnapshot))
            ) {
              return;
            }
            dataRef.current = { ...dataRef.current, snapshot: nextSnapshot };
            setSnapshot(nextSnapshot);
            setError(null);
            setLoading(false);
            scheduleCacheWrite();
          },
          handleWatchError
        ),
        watchProfileAnalyticsDailySnapshots(
          userId,
          (nextDailySnapshots, metadata) => {
            if (
              shouldKeepCachedValue(
                metadata,
                dataRef.current.dailySnapshots.length > 0,
                nextDailySnapshots.length > 0
              )
            ) {
              return;
            }
            dataRef.current = { ...dataRef.current, dailySnapshots: nextDailySnapshots };
            setDailySnapshots(nextDailySnapshots);
            markSupportingSectionLoaded('dailySnapshots');
            scheduleCacheWrite();
          },
          handleWatchError
        ),
        watchProfileViewers(
          userId,
          (nextProfileViewers, metadata) => {
            if (
              shouldKeepCachedValue(
                metadata,
                dataRef.current.profileViewers.length > 0,
                nextProfileViewers.length > 0
              )
            ) {
              return;
            }
            dataRef.current = { ...dataRef.current, profileViewers: nextProfileViewers };
            setProfileViewers(nextProfileViewers);
            markSupportingSectionLoaded('profileViewers');
            scheduleCacheWrite();
          },
          handleWatchError
        ),
        watchProfileViewerSummary(
          userId,
          (nextProfileViewerSummary, metadata) => {
            if (
              shouldKeepCachedValue(
                metadata,
                Boolean(dataRef.current.profileViewerSummary),
                Boolean(nextProfileViewerSummary)
              )
            ) {
              return;
            }
            dataRef.current = { ...dataRef.current, profileViewerSummary: nextProfileViewerSummary };
            setProfileViewerSummary(nextProfileViewerSummary);
            markSupportingSectionLoaded('profileViewerSummary');
            scheduleCacheWrite();
          },
          handleWatchError
        ),
        watchConnectionInvites(
          userId,
          (nextConnectionInvites, metadata) => {
            if (
              shouldKeepCachedValue(
                metadata,
                dataRef.current.connectionInvites.length > 0,
                nextConnectionInvites.length > 0
              )
            ) {
              return;
            }
            dataRef.current = { ...dataRef.current, connectionInvites: nextConnectionInvites };
            setConnectionInvites(nextConnectionInvites);
            markSupportingSectionLoaded('connectionInvites');
            scheduleCacheWrite();
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
  }, [userId]);

  useEffect(() => {
    let disposed = false;

    const readSyncStatus = async () => {
      const response = await sendMessageToExtension<{
        success: boolean;
        status?: ProfileAnalyticsSyncStatus | null;
        error?: string;
      }>({ type: 'DASHBOARD_GET_PROFILE_ANALYTICS_SYNC_STATUS' }, { timeoutMs: 3_000 });
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
    // Dashboard pages are read-only analytics consumers. Status polling is a
    // read-only compatibility path and must not start LinkedIn collection.
    void readSyncStatus();
    // Subsequent polls only read extension-local progress/errors.
    const intervalId = window.setInterval(() => void readSyncStatus(), 5_000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [userId]);

  return {
    snapshot,
    dailySnapshots,
    profileViewers,
    profileViewerSummary,
    connectionInvites,
    supportingDataLoaded,
    loading,
    error,
    syncStatus,
    syncStatusError,
    syncStatusLoaded,
    refresh,
    clearCache: () => deleteProfileAnalyticsCache(userId),
  };
}
