import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProfileAnalyticsConnectionInvite,
  ProfileAnalyticsDailySnapshot,
  ProfileAnalyticsSnapshot,
  ProfileViewer,
  ProfileViewerSummary,
} from 'shared/types';
import {
  loadCurrentProfileAnalyticsSnapshot,
  loadProfileAnalyticsSupportingData,
  watchConnectionInvites,
  watchProfileAnalyticsSnapshot,
  watchProfileViewers,
} from '../services/profile-analytics-firestore';

const MAX_INITIAL_SKELETON_MS = 10_000;

/**
 * Firestore is the only dashboard data source. LinkedIn synchronization is
 * owned by the extension background worker and is never triggered here.
 */
export function useProfileAnalytics(userId: string) {
  const [snapshot, setSnapshot] = useState<ProfileAnalyticsSnapshot | null>(null);
  const [dailySnapshots, setDailySnapshots] = useState<ProfileAnalyticsDailySnapshot[]>([]);
  const [profileViewers, setProfileViewers] = useState<ProfileViewer[]>([]);
  const [profileViewerSummary, setProfileViewerSummary] = useState<ProfileViewerSummary | null>(null);
  const [connectionInvites, setConnectionInvites] = useState<ProfileAnalyticsConnectionInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    const unsubscribeFromProfileViewers = watchProfileViewers(
      userId,
      (nextViewers) => setProfileViewers(nextViewers),
      (watchError) => setError(watchError.message)
    );

    void refresh();
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
      unsubscribeFromInvites();
      unsubscribeFromProfileViewers();
    };
  }, [refresh, userId]);

  return {
    snapshot,
    dailySnapshots,
    profileViewers,
    profileViewerSummary,
    connectionInvites,
    loading,
    error,
    refresh,
  };
}
