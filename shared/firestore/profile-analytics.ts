import { getDoc, getDocs, limit, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import type { ProfileAnalyticsDailySnapshot, ProfileAnalyticsSnapshot } from '../types';
import {
  docToProfileAnalyticsDailySnapshot,
  profileAnalyticsDailyCollection,
  profileAnalyticsDailyDoc,
  profileAnalyticsDoc,
  profileAnalyticsSampleDoc,
} from './refs';

function getUtcDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefinedDeep(item)])
  ) as T;
}

function buildDailySnapshotPatch(
  snapshot: Partial<ProfileAnalyticsSnapshot>,
  date: string,
  updatedAt: number
): Omit<Partial<ProfileAnalyticsDailySnapshot>, 'id'> {
  return {
    date,
    sampleKind: 'daily',
    updatedAt,
    ...(typeof snapshot.profile?.connectionsCount === 'number'
      ? { connectionsCount: snapshot.profile.connectionsCount }
      : {}),
    ...(typeof snapshot.profile?.followersCount === 'number'
      ? { followersCount: snapshot.profile.followersCount }
      : {}),
    ...(typeof snapshot.searchAppearances?.totalCount === 'number'
      ? { searchAppearancesCount: snapshot.searchAppearances.totalCount }
      : {}),
    ...(typeof snapshot.socialSellingIndex?.score === 'number'
      ? { socialSellingIndexScore: snapshot.socialSellingIndex.score }
      : {}),
    ...(typeof snapshot.acceptanceRate?.rate === 'number' ? { acceptanceRate: snapshot.acceptanceRate.rate } : {}),
    ...(typeof snapshot.profileViews?.totalCount === 'number'
      ? { profileViewsCount: snapshot.profileViews.totalCount }
      : {}),
  };
}

function buildSampleSnapshotPatch(
  snapshot: Partial<ProfileAnalyticsSnapshot>,
  updatedAt: number
): Omit<Partial<ProfileAnalyticsDailySnapshot>, 'id'> {
  return {
    ...buildDailySnapshotPatch(snapshot, new Date(updatedAt).toISOString(), updatedAt),
    sampleKind: 'sample',
  };
}

function hasRangeMetric(snapshot: Partial<ProfileAnalyticsDailySnapshot>): boolean {
  return [
    snapshot.connectionsCount,
    snapshot.followersCount,
    snapshot.searchAppearancesCount,
    snapshot.socialSellingIndexScore,
    snapshot.acceptanceRate,
    snapshot.profileViewsCount,
  ].some((value) => typeof value === 'number');
}

export async function getProfileAnalyticsSnapshot(userId: string): Promise<ProfileAnalyticsSnapshot | null> {
  const snapshot = await getDoc(profileAnalyticsDoc(userId));
  return snapshot.exists() ? (snapshot.data() as ProfileAnalyticsSnapshot) : null;
}

export function subscribeToProfileAnalyticsSnapshot(
  userId: string,
  onValue: (snapshot: ProfileAnalyticsSnapshot | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    profileAnalyticsDoc(userId),
    (snapshot) => onValue(snapshot.exists() ? (snapshot.data() as ProfileAnalyticsSnapshot) : null),
    (error) => onError?.(error)
  );
}

export async function upsertProfileAnalyticsSnapshot(
  userId: string,
  snapshot: Partial<ProfileAnalyticsSnapshot>,
  options: {
    updatedAt?: number;
    date?: string;
  } = {}
): Promise<ProfileAnalyticsSnapshot> {
  const updatedAt = options.updatedAt || Date.now();
  const date = options.date || getUtcDateKey(updatedAt);
  const patch: Partial<ProfileAnalyticsSnapshot> & { updatedAt: number } = {
    ...stripUndefinedDeep(snapshot),
    updatedAt,
  };

  await setDoc(profileAnalyticsDoc(userId), patch, { merge: true });

  const dailyPatch = buildDailySnapshotPatch(snapshot, date, updatedAt);
  await setDoc(profileAnalyticsDailyDoc(userId, date), dailyPatch, { merge: true });

  const samplePatch = buildSampleSnapshotPatch(snapshot, updatedAt);
  if (hasRangeMetric(samplePatch)) {
    await setDoc(profileAnalyticsSampleDoc(userId, updatedAt), samplePatch, { merge: true });
  }

  const next = await getProfileAnalyticsSnapshot(userId);
  return next || ({ updatedAt } as ProfileAnalyticsSnapshot);
}

export async function getProfileAnalyticsDailySnapshots(
  userId: string,
  maxCount = 90
): Promise<ProfileAnalyticsDailySnapshot[]> {
  const q = query(profileAnalyticsDailyCollection(userId), orderBy('date', 'desc'), limit(maxCount));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(docToProfileAnalyticsDailySnapshot)
    .sort((left, right) => left.date.localeCompare(right.date));
}
