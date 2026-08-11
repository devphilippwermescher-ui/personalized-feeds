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
  loadCurrentProfileAnalyticsSnapshot,
  loadProfileAnalyticsSupportingData,
  watchConnectionInvites,
  watchProfileAnalyticsDailySnapshots,
  watchProfileAnalyticsSnapshot,
  watchProfileViewers,
} from '../services/profile-analytics-firestore';

const MAX_INITIAL_SKELETON_MS = 10_000;

/**
 * Firestore remains the only dashboard data source. Opening this feature
 * sends a wake-up signal to the extension-owned background coordinator; live
 * Firestore subscriptions deliver any refreshed values without a page reload.
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
  const observedUpdatedAt = useRef<number | undefined>();
  const syncWasRunning = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const currentSnapshot = await loadCurrentProfileAnalyticsSnapshot(userId);
      setSnapshot(currentSnapshot);
      setError(null);
      if (currentSnapshot) setLoading(false);

      // The current snapshot is the critical render path. Larger history,
      // viewers, and invite queries start only after the page can be shown.
      const supportingData = await loadProfileAnalyticsSupportingData(userId);
      setDailySnapshots(supportingData.dailySnapshots);
      setProfileViewers(supportingData.profileViewers);
      setProfileViewerSummary(supportingData.profileViewerSummary);
      setConnectionInvites(supportingData.connectionInvites);
      setSupportingDataLoaded(true);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    setSupportingDataLoaded(false);
    setError(null);
    observedUpdatedAt.current = undefined;
    const timeoutId = window.setTimeout(() => setLoading(false), MAX_INITIAL_SKELETON_MS);
    const unsubscribe = watchProfileAnalyticsSnapshot(
      userId,
      (nextSnapshot) => {
        const previousUpdatedAt = observedUpdatedAt.current;
        observedUpdatedAt.current = nextSnapshot?.updatedAt;
        setSnapshot(nextSnapshot);
        if (nextSnapshot) setLoading(false);
        if (
          typeof previousUpdatedAt === 'number' &&
          typeof nextSnapshot?.updatedAt === 'number' &&
          nextSnapshot.updatedAt !== previousUpdatedAt
        ) {
          void refresh();
        }
      },
      (watchError) => {
        setError(watchError.message);
        setLoading(false);
      }
    );
    const unsubscribeFromInvites = watchConnectionInvites(
      userId,
      (nextInvites) => setConnectionInvites(nextInvites),
      (watchError) => setError(watchError.message)
    );
    const unsubscribeFromDailySnapshots = watchProfileAnalyticsDailySnapshots(
      userId,
      (nextDailySnapshots) => setDailySnapshots(nextDailySnapshots),
      (watchError) => setError(watchError.message)
    );
    const unsubscribeFromProfileViewers = watchProfileViewers(
      userId,
      (nextViewers) => setProfileViewers(nextViewers),
      (watchError) => setError(watchError.message)
    );

    void refresh();
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
      unsubscribeFromDailySnapshots();
      unsubscribeFromInvites();
      unsubscribeFromProfileViewers();
    };
  }, [refresh, userId]);

  useEffect(() => {
    let disposed = false;
    let hiddenAt: number | undefined;

    const readSyncStatus = async (refreshWhenSettled = false) => {
      const response = await sendMessageToExtension<{
        success: boolean;
        status?: ProfileAnalyticsSyncStatus | null;
        error?: string;
      }>({ type: 'DASHBOARD_GET_PROFILE_ANALYTICS_SYNC_STATUS' });
      if (disposed) return;
      if (response.success) {
        const nextStatus = response.status || null;
        const isSyncing = nextStatus?.status === 'syncing';
        const shouldRefreshSettledData = !isSyncing && (refreshWhenSettled || syncWasRunning.current);
        if (isSyncing) {
          syncWasRunning.current = true;
        } else if (shouldRefreshSettledData) {
          await refresh();
          if (disposed) return;
          syncWasRunning.current = false;
        }
        setSyncStatus(nextStatus);
        setSyncStatusError(null);
      } else {
        setSyncStatusError(response.error || 'myFeedPilot extension is not available.');
      }
      setSyncStatusLoaded(true);
    };

    const triggerLightSync = async () => {
      setSyncStatusLoaded(false);
      const response = await sendMessageToExtension<{ success: boolean; error?: string }>({
        type: 'DASHBOARD_PROFILE_ANALYTICS_OPENED',
      });
      if (!disposed && !response.success) {
        setSyncStatusError(response.error || 'myFeedPilot extension is not available.');
        setSyncStatusLoaded(true);
      }
      window.setTimeout(() => {
        if (!disposed && response.success) void readSyncStatus(true);
      }, 500);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= 5 * 60 * 1000) {
        void triggerLightSync();
      }
      hiddenAt = undefined;
    };

    setSyncStatus(null);
    setSyncStatusError(null);
    setSyncStatusLoaded(false);
    syncWasRunning.current = false;
    void triggerLightSync();
    const intervalId = window.setInterval(() => void readSyncStatus(), 5_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
  };
}
