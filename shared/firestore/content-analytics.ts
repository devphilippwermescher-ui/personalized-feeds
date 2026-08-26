import { getDoc, getDocs, limit, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';
import type {
  ContentAnalyticsDailySnapshot,
  ContentAnalyticsPost,
  ContentAnalyticsRangeSnapshot,
  ContentAnalyticsSnapshot,
} from '../types';
import {
  contentAnalyticsDailyCollection,
  contentAnalyticsDailyDoc,
  contentAnalyticsDoc,
  contentAnalyticsPostDoc,
  contentAnalyticsPostsCollection,
  contentAnalyticsRangeDoc,
  contentAnalyticsRangesCollection,
  docToContentAnalyticsDailySnapshot,
  docToContentAnalyticsPost,
  docToContentAnalyticsRangeSnapshot,
} from './refs';
import { stripUndefinedDeep } from './serialize';

export { getContentAnalyticsPostId } from '../content-analytics-metrics';

export const CONTENT_ANALYTICS_POST_WRITE_LIMIT = 200;
const FIRESTORE_BATCH_LIMIT = 450;

export interface ContentAnalyticsPublishInput {
  snapshot: ContentAnalyticsSnapshot;
  ranges?: ContentAnalyticsRangeSnapshot[];
  daily?: ContentAnalyticsDailySnapshot[];
}

export async function getContentAnalyticsSnapshot(userId: string): Promise<ContentAnalyticsSnapshot | null> {
  const snapshot = await getDoc(contentAnalyticsDoc(userId));
  return snapshot.exists() ? (snapshot.data() as ContentAnalyticsSnapshot) : null;
}

export function subscribeToContentAnalyticsSnapshot(
  userId: string,
  onValue: (snapshot: ContentAnalyticsSnapshot | null, metadata?: { fromCache: boolean }) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    contentAnalyticsDoc(userId),
    (snapshot) =>
      onValue(snapshot.exists() ? (snapshot.data() as ContentAnalyticsSnapshot) : null, {
        fromCache: snapshot.metadata.fromCache,
      }),
    (error) => onError?.(error)
  );
}

export async function getContentAnalyticsRangeSnapshots(userId: string): Promise<ContentAnalyticsRangeSnapshot[]> {
  const snapshot = await getDocs(contentAnalyticsRangesCollection(userId));
  return snapshot.docs.map(docToContentAnalyticsRangeSnapshot);
}

export function subscribeToContentAnalyticsRangeSnapshots(
  userId: string,
  onValue: (snapshots: ContentAnalyticsRangeSnapshot[], metadata?: { fromCache: boolean }) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    contentAnalyticsRangesCollection(userId),
    (snapshot) =>
      onValue(snapshot.docs.map(docToContentAnalyticsRangeSnapshot), { fromCache: snapshot.metadata.fromCache }),
    (error) => onError?.(error)
  );
}

export async function getContentAnalyticsDailySnapshots(
  userId: string,
  maxCount = 400
): Promise<ContentAnalyticsDailySnapshot[]> {
  const snapshot = await getDocs(
    query(contentAnalyticsDailyCollection(userId), orderBy('date', 'desc'), limit(maxCount))
  );
  return snapshot.docs.map(docToContentAnalyticsDailySnapshot).sort((left, right) => left.date.localeCompare(right.date));
}

export function subscribeToContentAnalyticsDailySnapshots(
  userId: string,
  maxCount: number,
  onValue: (snapshots: ContentAnalyticsDailySnapshot[], metadata?: { fromCache: boolean }) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(contentAnalyticsDailyCollection(userId), orderBy('date', 'desc'), limit(maxCount)),
    (snapshot) =>
      onValue(
        snapshot.docs
          .map(docToContentAnalyticsDailySnapshot)
          .sort((left, right) => left.date.localeCompare(right.date)),
        { fromCache: snapshot.metadata.fromCache }
      ),
    (error) => onError?.(error)
  );
}

export async function getContentAnalyticsPosts(
  userId: string,
  maxCount = CONTENT_ANALYTICS_POST_WRITE_LIMIT
): Promise<ContentAnalyticsPost[]> {
  const snapshot = await getDocs(
    query(contentAnalyticsPostsCollection(userId), orderBy('publishedAt', 'desc'), limit(maxCount))
  );
  return snapshot.docs.map(docToContentAnalyticsPost);
}

export function subscribeToContentAnalyticsPosts(
  userId: string,
  maxCount: number,
  onValue: (posts: ContentAnalyticsPost[], metadata?: { fromCache: boolean }) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    query(contentAnalyticsPostsCollection(userId), orderBy('publishedAt', 'desc'), limit(maxCount)),
    (snapshot) => onValue(snapshot.docs.map(docToContentAnalyticsPost), { fromCache: snapshot.metadata.fromCache }),
    (error) => onError?.(error)
  );
}

/**
 * Current snapshot, range snapshots, and daily points are committed together
 * so the dashboard never observes a range without its own current document.
 * Posts are written separately because their count is unbounded.
 */
export async function publishContentAnalytics(
  userId: string,
  input: ContentAnalyticsPublishInput,
  batch = writeBatch(getFirebaseDb())
): Promise<void> {
  batch.set(contentAnalyticsDoc(userId), stripUndefinedDeep(input.snapshot), { merge: true });
  (input.ranges || []).forEach((range) => {
    const { id, ...data } = range;
    batch.set(contentAnalyticsRangeDoc(userId, id), stripUndefinedDeep(data), { merge: true });
  });
  (input.daily || []).forEach((day) => {
    const { id: _ignored, ...data } = day;
    batch.set(contentAnalyticsDailyDoc(userId, day.date), stripUndefinedDeep(data), { merge: true });
  });
}

export async function writeContentAnalyticsPosts(userId: string, posts: ContentAnalyticsPost[]): Promise<void> {
  for (let index = 0; index < posts.length; index += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(getFirebaseDb());
    posts.slice(index, index + FIRESTORE_BATCH_LIMIT).forEach((post) => {
      const { id, ...data } = post;
      batch.set(contentAnalyticsPostDoc(userId, id), stripUndefinedDeep(data), { merge: true });
    });
    await batch.commit();
  }
}
