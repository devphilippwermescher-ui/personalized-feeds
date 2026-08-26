import { getDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';
import type { DashboardAnalyticsSyncManifest } from '../types';
import { dashboardAnalyticsSyncDoc } from './refs';
import { stripUndefinedDeep } from './serialize';

export async function getDashboardAnalyticsSyncManifest(
  userId: string
): Promise<DashboardAnalyticsSyncManifest | null> {
  const snapshot = await getDoc(dashboardAnalyticsSyncDoc(userId));
  return snapshot.exists() ? (snapshot.data() as DashboardAnalyticsSyncManifest) : null;
}

export function subscribeToDashboardAnalyticsSyncManifest(
  userId: string,
  onValue: (manifest: DashboardAnalyticsSyncManifest | null, metadata?: { fromCache: boolean }) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    dashboardAnalyticsSyncDoc(userId),
    (snapshot) =>
      onValue(snapshot.exists() ? (snapshot.data() as DashboardAnalyticsSyncManifest) : null, {
        fromCache: snapshot.metadata.fromCache,
      }),
    (error) => onError?.(error)
  );
}

/** Queues the manifest into a caller-owned batch so it lands with the snapshots. */
export function stageDashboardAnalyticsSyncManifest(
  userId: string,
  manifest: DashboardAnalyticsSyncManifest,
  batch: ReturnType<typeof writeBatch>
): void {
  batch.set(dashboardAnalyticsSyncDoc(userId), stripUndefinedDeep(manifest), { merge: false });
}

export async function setDashboardAnalyticsSyncManifest(
  userId: string,
  manifest: DashboardAnalyticsSyncManifest
): Promise<void> {
  const batch = writeBatch(getFirebaseDb());
  stageDashboardAnalyticsSyncManifest(userId, manifest, batch);
  await batch.commit();
}
