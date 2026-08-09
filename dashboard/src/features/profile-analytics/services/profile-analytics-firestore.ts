import {
  getConnectionInvites,
  getProfileAnalyticsDailySnapshots,
  getProfileAnalyticsSnapshot,
  getProfileViewerCount,
  getProfileViewerSummary,
  subscribeToProfileAnalyticsSnapshot,
} from 'shared/firestore-service';
import type {
  ProfileAnalyticsConnectionInvite,
  ProfileAnalyticsDailySnapshot,
  ProfileAnalyticsSnapshot,
  ProfileViewerSummary,
} from 'shared/types';

export interface ProfileAnalyticsFirestoreData {
  snapshot: ProfileAnalyticsSnapshot | null;
  dailySnapshots: ProfileAnalyticsDailySnapshot[];
  profileViewerCount: number;
  profileViewerSummary: ProfileViewerSummary | null;
  connectionInvites: ProfileAnalyticsConnectionInvite[];
}

export async function loadProfileAnalyticsFirestoreData(userId: string): Promise<ProfileAnalyticsFirestoreData> {
  const [snapshot, dailySnapshots, profileViewerCount, profileViewerSummary, connectionInvites] = await Promise.all([
    getProfileAnalyticsSnapshot(userId),
    getProfileAnalyticsDailySnapshots(userId, 365).catch(() => []),
    getProfileViewerCount(userId).catch(() => 0),
    getProfileViewerSummary(userId).catch(() => null),
    getConnectionInvites(userId).catch(() => []),
  ]);

  return {
    snapshot,
    dailySnapshots,
    profileViewerCount,
    profileViewerSummary,
    connectionInvites,
  };
}

export function watchProfileAnalyticsSnapshot(
  userId: string,
  onValue: (snapshot: ProfileAnalyticsSnapshot | null) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToProfileAnalyticsSnapshot(userId, onValue, onError);
}
