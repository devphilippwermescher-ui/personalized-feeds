import {
  getConnectionInvites,
  getChronologicalProfileViewers,
  getProfileAnalyticsDailySnapshots,
  getProfileAnalyticsSnapshot,
  getProfileViewerSummary,
  subscribeToChronologicalProfileViewers,
  subscribeToConnectionInvites,
  subscribeToProfileAnalyticsDailySnapshots,
  subscribeToProfileAnalyticsSnapshot,
} from 'shared/firestore-service';
import type {
  ProfileAnalyticsConnectionInvite,
  ProfileAnalyticsDailySnapshot,
  ProfileAnalyticsSnapshot,
  ProfileViewer,
  ProfileViewerSummary,
} from 'shared/types';

export interface ProfileAnalyticsFirestoreData {
  snapshot: ProfileAnalyticsSnapshot | null;
  dailySnapshots: ProfileAnalyticsDailySnapshot[];
  profileViewers: ProfileViewer[];
  profileViewerSummary: ProfileViewerSummary | null;
  connectionInvites: ProfileAnalyticsConnectionInvite[];
}

export type ProfileAnalyticsSupportingData = Omit<ProfileAnalyticsFirestoreData, 'snapshot'>;

export function loadCurrentProfileAnalyticsSnapshot(userId: string): Promise<ProfileAnalyticsSnapshot | null> {
  return getProfileAnalyticsSnapshot(userId);
}

export async function loadProfileAnalyticsSupportingData(userId: string): Promise<ProfileAnalyticsSupportingData> {
  const [dailySnapshots, profileViewers, profileViewerSummary, connectionInvites] = await Promise.all([
    getProfileAnalyticsDailySnapshots(userId, 365).catch(() => []),
    getChronologicalProfileViewers(userId).catch(() => []),
    getProfileViewerSummary(userId).catch(() => null),
    getConnectionInvites(userId).catch(() => []),
  ]);

  return { dailySnapshots, profileViewers, profileViewerSummary, connectionInvites };
}

export async function loadProfileAnalyticsFirestoreData(userId: string): Promise<ProfileAnalyticsFirestoreData> {
  const [snapshot, supportingData] = await Promise.all([
    loadCurrentProfileAnalyticsSnapshot(userId),
    loadProfileAnalyticsSupportingData(userId),
  ]);
  return { snapshot, ...supportingData };
}

export function watchProfileAnalyticsSnapshot(
  userId: string,
  onValue: (snapshot: ProfileAnalyticsSnapshot | null) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToProfileAnalyticsSnapshot(userId, onValue, onError);
}

export function watchProfileAnalyticsDailySnapshots(
  userId: string,
  onValue: (snapshots: ProfileAnalyticsDailySnapshot[]) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToProfileAnalyticsDailySnapshots(userId, 365, onValue, onError);
}

export function watchConnectionInvites(
  userId: string,
  onValue: (invites: ProfileAnalyticsConnectionInvite[]) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToConnectionInvites(userId, onValue, onError);
}

export function watchProfileViewers(
  userId: string,
  onValue: (viewers: ProfileViewer[]) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToChronologicalProfileViewers(userId, onValue, onError);
}
