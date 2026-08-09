import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProfileAnalyticsConnectionInvite,
  ProfileAnalyticsDailySnapshot,
  ProfileAnalyticsSnapshot,
  ProfileViewerSummary,
} from 'shared/types';
import {
  loadProfileAnalyticsFirestoreData,
  watchProfileAnalyticsSnapshot,
} from '../services/profile-analytics-firestore';

const MAX_INITIAL_SKELETON_MS = 10_000;

/**
 * Firestore is the only dashboard data source. LinkedIn synchronization is
 * owned by the extension background worker and is never triggered here.
 */
export function useProfileAnalytics(userId: string) {
  const [snapshot, setSnapshot] = useState<ProfileAnalyticsSnapshot | null>(null);
  const [dailySnapshots, setDailySnapshots] = useState<ProfileAnalyticsDailySnapshot[]>([]);
  const [profileViewerCount, setProfileViewerCount] = useState(0);
  const [profileViewerSummary, setProfileViewerSummary] = useState<ProfileViewerSummary | null>(null);
  const [connectionInvites, setConnectionInvites] = useState<ProfileAnalyticsConnectionInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const observedUpdatedAt = useRef<number | undefined>();

  const refresh = useCallback(async () => {
    try {
      const data = await loadProfileAnalyticsFirestoreData(userId);
      setSnapshot(data.snapshot);
      setDailySnapshots(data.dailySnapshots);
      setProfileViewerCount(data.profileViewerCount);
      setProfileViewerSummary(data.profileViewerSummary);
      setConnectionInvites(data.connectionInvites);
      setError(null);
      if (data.snapshot) setLoading(false);
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

    void refresh();
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [refresh, userId]);

  return {
    snapshot,
    dailySnapshots,
    profileViewerCount,
    profileViewerSummary,
    connectionInvites,
    loading,
    error,
    refresh,
  };
}
