import { getDoc, getDocs, limit, onSnapshot, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';
import type { ProfileAnalyticsDailySnapshot, ProfileAnalyticsSnapshot } from '../types';
import {
  docToProfileAnalyticsDailySnapshot,
  legacyProfileAnalyticsDailyCollection,
  legacyProfileAnalyticsDoc,
  profileAnalyticsMigrationDoc,
  profileAnalyticsDailyCollection,
  profileAnalyticsDailyDoc,
  profileAnalyticsDoc,
  profileAnalyticsSampleDoc,
  profileConnectionInviteDoc,
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
  const hasFreshExactConnections =
    typeof snapshot.profile?.connectionsCount === 'number' &&
    snapshot.profile.connectionsCountExact === true &&
    snapshot.profile.connectionsCountUpdatedAt === updatedAt;
  return {
    date,
    sampleKind: 'daily',
    updatedAt,
    ...(hasFreshExactConnections ? { connectionsCount: snapshot.profile!.connectionsCount } : {}),
    ...(hasFreshExactConnections ? { connectionsCountExact: true } : {}),
    ...(hasFreshExactConnections && snapshot.profile?.connectionsCountSource
      ? { connectionsCountSource: snapshot.profile.connectionsCountSource }
      : {}),
    ...(hasFreshExactConnections && typeof snapshot.profile?.connectionDateCounts?.[date] === 'number'
      ? {
          connectionsAdded: snapshot.profile.connectionDateCounts[date],
          connectionsAddedEstimated: snapshot.profile.connectionHistoryKind === 'backfilled_current_connections',
        }
      : {}),
    ...(typeof snapshot.profile?.followersCount === 'number'
      ? { followersCount: snapshot.profile.followersCount }
      : {}),
    ...(typeof snapshot.profile?.followersCountExact === 'boolean'
      ? { followersCountExact: snapshot.profile.followersCountExact }
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
    ...(typeof snapshot.profileViews?.visibleCount === 'number'
      ? { profileViewsVisibleCount: snapshot.profileViews.visibleCount }
      : {}),
    ...(typeof snapshot.profileViews?.privateCount === 'number'
      ? { profileViewsPrivateCount: snapshot.profileViews.privateCount }
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

/**
 * One-way, non-destructive migration from the old mixed metadata collection.
 * Legacy documents remain readable during rollout, but every new write uses a
 * dedicated Profile Analytics collection.
 */
export async function migrateLegacyProfileAnalyticsStorage(userId: string): Promise<void> {
  const marker = await getDoc(profileAnalyticsMigrationDoc(userId));
  if (marker.exists()) return;

  const [current, legacyCurrent, legacyDailyDocuments, legacyInviteDocuments] = await Promise.all([
    getDoc(profileAnalyticsDoc(userId)),
    getDoc(legacyProfileAnalyticsDoc(userId)),
    getDocs(query(legacyProfileAnalyticsDailyCollection(userId), where('sampleKind', '==', 'daily'))),
    getDocs(query(legacyProfileAnalyticsDailyCollection(userId), where('kind', '==', 'connectionInvite'))),
  ]);
  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  if (!current.exists() && legacyCurrent.exists()) {
    writes.push((batch) => batch.set(profileAnalyticsDoc(userId), legacyCurrent.data(), { merge: true }));
  }
  legacyDailyDocuments.docs.forEach((document) => {
    if (document.id.startsWith('profileAnalyticsDaily_')) {
      const date = document.id.slice('profileAnalyticsDaily_'.length);
      writes.push((batch) => batch.set(profileAnalyticsDailyDoc(userId, date), document.data(), { merge: true }));
    }
  });
  legacyInviteDocuments.docs.forEach((document) => {
    if (document.id.startsWith('connectionInvite_')) {
      const storageKey = document.id.slice('connectionInvite_'.length);
      writes.push((batch) =>
        batch.set(profileConnectionInviteDoc(userId, storageKey), document.data(), { merge: true })
      );
    }
  });

  for (let index = 0; index < writes.length; index += 400) {
    const batch = writeBatch(getFirebaseDb());
    writes.slice(index, index + 400).forEach((write) => write(batch));
    await batch.commit();
  }
  const finalBatch = writeBatch(getFirebaseDb());
  finalBatch.set(profileAnalyticsMigrationDoc(userId), { version: 2, completedAt: Date.now() });
  await finalBatch.commit();
}

export async function getProfileAnalyticsSnapshot(userId: string): Promise<ProfileAnalyticsSnapshot | null> {
  const snapshot = await getDoc(profileAnalyticsDoc(userId));
  if (snapshot.exists()) return snapshot.data() as ProfileAnalyticsSnapshot;
  const legacySnapshot = await getDoc(legacyProfileAnalyticsDoc(userId));
  return legacySnapshot.exists() ? (legacySnapshot.data() as ProfileAnalyticsSnapshot) : null;
}

export function subscribeToProfileAnalyticsSnapshot(
  userId: string,
  onValue: (snapshot: ProfileAnalyticsSnapshot | null) => void,
  onError?: (error: Error) => void
): () => void {
  let current: ProfileAnalyticsSnapshot | null = null;
  let legacy: ProfileAnalyticsSnapshot | null = null;
  let currentLoaded = false;
  let legacyLoaded = false;
  const emit = () => {
    if (!currentLoaded || !legacyLoaded) return;
    onValue(current || legacy);
  };
  const unsubscribeCurrent = onSnapshot(
    profileAnalyticsDoc(userId),
    (snapshot) => {
      current = snapshot.exists() ? (snapshot.data() as ProfileAnalyticsSnapshot) : null;
      currentLoaded = true;
      emit();
    },
    (error) => onError?.(error)
  );
  const unsubscribeLegacy = onSnapshot(
    legacyProfileAnalyticsDoc(userId),
    (snapshot) => {
      legacy = snapshot.exists() ? (snapshot.data() as ProfileAnalyticsSnapshot) : null;
      legacyLoaded = true;
      emit();
    },
    (error) => onError?.(error)
  );
  return () => {
    unsubscribeCurrent();
    unsubscribeLegacy();
  };
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

  const dailyPatch = buildDailySnapshotPatch(snapshot, date, updatedAt);
  const samplePatch = buildSampleSnapshotPatch(snapshot, updatedAt);
  const batch = writeBatch(getFirebaseDb());
  batch.set(profileAnalyticsDoc(userId), patch, { merge: true });
  batch.set(profileAnalyticsDailyDoc(userId, date), dailyPatch, { merge: true });
  if (hasRangeMetric(samplePatch)) {
    batch.set(profileAnalyticsSampleDoc(userId, updatedAt), samplePatch, { merge: true });
  }
  await batch.commit();

  const next = await getProfileAnalyticsSnapshot(userId);
  return next || ({ updatedAt } as ProfileAnalyticsSnapshot);
}

export async function getProfileAnalyticsDailySnapshots(
  userId: string,
  maxCount = 90
): Promise<ProfileAnalyticsDailySnapshot[]> {
  const q = query(profileAnalyticsDailyCollection(userId), orderBy('date', 'desc'), limit(maxCount));
  const snapshot = await getDocs(q);
  const current = snapshot.docs
    .map(docToProfileAnalyticsDailySnapshot)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (current.length > 0) return current;

  // Read-only compatibility for users collected before analytics was split
  // out of profileViewerMetadata. New writes never return to that collection.
  const legacySnapshot = await getDocs(
    query(legacyProfileAnalyticsDailyCollection(userId), orderBy('date', 'desc'), limit(maxCount * 3))
  );
  return legacySnapshot.docs
    .filter((document) => document.id.startsWith('profileAnalyticsDaily_'))
    .map(docToProfileAnalyticsDailySnapshot)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function subscribeToProfileAnalyticsDailySnapshots(
  userId: string,
  maxCount: number,
  onValue: (snapshots: ProfileAnalyticsDailySnapshot[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(profileAnalyticsDailyCollection(userId), orderBy('date', 'desc'), limit(maxCount));
  const legacyQuery = query(
    legacyProfileAnalyticsDailyCollection(userId),
    orderBy('date', 'desc'),
    limit(maxCount * 3)
  );
  let current: ProfileAnalyticsDailySnapshot[] = [];
  let legacy: ProfileAnalyticsDailySnapshot[] = [];
  let currentLoaded = false;
  let legacyLoaded = false;
  const emit = () => {
    if (!currentLoaded || !legacyLoaded) return;
    onValue(current.length > 0 ? current : legacy);
  };
  const unsubscribeCurrent = onSnapshot(
    q,
    (snapshot) => {
      current = snapshot.docs
        .map(docToProfileAnalyticsDailySnapshot)
        .sort((left, right) => left.date.localeCompare(right.date));
      currentLoaded = true;
      emit();
    },
    (error) => onError?.(error)
  );
  const unsubscribeLegacy = onSnapshot(
    legacyQuery,
    (snapshot) => {
      legacy = snapshot.docs
        .filter((document) => document.id.startsWith('profileAnalyticsDaily_'))
        .map(docToProfileAnalyticsDailySnapshot)
        .sort((left, right) => left.date.localeCompare(right.date));
      legacyLoaded = true;
      emit();
    },
    (error) => onError?.(error)
  );
  return () => {
    unsubscribeCurrent();
    unsubscribeLegacy();
  };
}
