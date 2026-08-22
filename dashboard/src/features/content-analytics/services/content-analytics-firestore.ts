import {
  getContentAnalyticsDailySnapshots,
  getContentAnalyticsPosts,
  getContentAnalyticsRangeSnapshots,
  getContentAnalyticsSnapshot,
  getDashboardAnalyticsSyncManifest,
  subscribeToContentAnalyticsDailySnapshots,
  subscribeToContentAnalyticsPosts,
  subscribeToContentAnalyticsRangeSnapshots,
  subscribeToContentAnalyticsSnapshot,
  subscribeToDashboardAnalyticsSyncManifest,
} from 'shared/firestore-service';
import type {
  ContentAnalyticsDailySnapshot,
  ContentAnalyticsPost,
  ContentAnalyticsRangeSnapshot,
  ContentAnalyticsSnapshot,
  DashboardAnalyticsSyncManifest,
} from 'shared/types';

const MAX_DAILY_SNAPSHOTS = 400;
const MAX_POSTS = 200;

export interface ContentAnalyticsFirestoreData {
  snapshot: ContentAnalyticsSnapshot | null;
  ranges: ContentAnalyticsRangeSnapshot[];
  dailySnapshots: ContentAnalyticsDailySnapshot[];
  posts: ContentAnalyticsPost[];
  syncManifest: DashboardAnalyticsSyncManifest | null;
}

export interface ContentAnalyticsWatchMetadata {
  fromCache: boolean;
}

/**
 * Firestore reads for Content Analytics. The dashboard never contacts
 * LinkedIn: the extension owns every LinkedIn request and publishes here.
 */
export async function loadContentAnalyticsFirestoreData(
  userId: string
): Promise<ContentAnalyticsFirestoreData> {
  const [snapshot, ranges, dailySnapshots, posts, syncManifest] = await Promise.all([
    getContentAnalyticsSnapshot(userId).catch(() => null),
    getContentAnalyticsRangeSnapshots(userId).catch(() => []),
    getContentAnalyticsDailySnapshots(userId, MAX_DAILY_SNAPSHOTS).catch(() => []),
    getContentAnalyticsPosts(userId, MAX_POSTS).catch(() => []),
    getDashboardAnalyticsSyncManifest(userId).catch(() => null),
  ]);

  return { snapshot, ranges, dailySnapshots, posts, syncManifest };
}

export function watchContentAnalyticsSnapshot(
  userId: string,
  onValue: (snapshot: ContentAnalyticsSnapshot | null, metadata?: ContentAnalyticsWatchMetadata) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToContentAnalyticsSnapshot(userId, onValue, onError);
}

export function watchContentAnalyticsRanges(
  userId: string,
  onValue: (ranges: ContentAnalyticsRangeSnapshot[], metadata?: ContentAnalyticsWatchMetadata) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToContentAnalyticsRangeSnapshots(userId, onValue, onError);
}

export function watchContentAnalyticsDailySnapshots(
  userId: string,
  onValue: (snapshots: ContentAnalyticsDailySnapshot[], metadata?: ContentAnalyticsWatchMetadata) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToContentAnalyticsDailySnapshots(userId, MAX_DAILY_SNAPSHOTS, onValue, onError);
}

export function watchContentAnalyticsPosts(
  userId: string,
  onValue: (posts: ContentAnalyticsPost[], metadata?: ContentAnalyticsWatchMetadata) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToContentAnalyticsPosts(userId, MAX_POSTS, onValue, onError);
}

export function watchDashboardAnalyticsSyncManifest(
  userId: string,
  onValue: (manifest: DashboardAnalyticsSyncManifest | null, metadata?: ContentAnalyticsWatchMetadata) => void,
  onError: (error: Error) => void
): () => void {
  return subscribeToDashboardAnalyticsSyncManifest(userId, onValue, onError);
}
