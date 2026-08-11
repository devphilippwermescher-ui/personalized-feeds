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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<ProfileAnalyticsSyncStatus | null>(null);
  const [syncStatusError, setSyncStatusError] = useState<string | null>(null);
  const observedUpdatedAt = useRef<number | undefined>();

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
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
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

    const readSyncStatus = async () => {
      const response = await sendMessageToExtension<{
        success: boolean;
        status?: ProfileAnalyticsSyncStatus | null;
        error?: string;
      }>({ type: 'DASHBOARD_GET_PROFILE_ANALYTICS_SYNC_STATUS' });
      if (disposed) return;
      if (response.success) {
        setSyncStatus(response.status || null);
        setSyncStatusError(null);
      } else {
        setSyncStatusError(response.error || 'myFeedPilot extension is not available.');
      }
    };

    const triggerLightSync = async () => {
      const response = await sendMessageToExtension<{ success: boolean; error?: string }>({
        type: 'DASHBOARD_PROFILE_ANALYTICS_OPENED',
      });
      if (!disposed && !response.success) {
        setSyncStatusError(response.error || 'myFeedPilot extension is not available.');
      }
      window.setTimeout(() => {
        if (!disposed) void readSyncStatus();
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

    void triggerLightSync();
    void readSyncStatus();
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
    loading,
    error,
    syncStatus,
    syncStatusError,
    refresh,
  };
}
