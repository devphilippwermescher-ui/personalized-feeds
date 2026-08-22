import { collection, getDocs, writeBatch, type DocumentReference } from 'firebase/firestore';
import { getFirebaseDb } from 'shared/firebase-config';
import { getAuthenticatedFeedsUser } from './feeds-auth';
import { CONNECTION_INVITES_STATUS_ALARM_NAME } from './connection-invites-sync';
import { PROFILE_ANALYTICS_ALARM_NAME } from './profile-analytics-sync-runtime';

const DELETE_BATCH_SIZE = 400;

const ANALYTICS_COLLECTION_TARGETS = [
  { collectionName: 'profileAnalytics' },
  { collectionName: 'profileAnalyticsDaily' },
  { collectionName: 'profileAnalyticsSamples' },
  { collectionName: 'profileAnalyticsJobs' },
  { collectionName: 'profileAnalyticsHistoryChunks' },
  { collectionName: 'contentAnalytics' },
  { collectionName: 'contentAnalyticsRanges' },
  { collectionName: 'contentAnalyticsDaily' },
  { collectionName: 'contentAnalyticsPosts' },
  { collectionName: 'dashboardAnalyticsSync' },
  // Delete only the legacy analytics document from this mixed collection.
  // Profile Viewers summary and relationship metadata must remain intact.
  { collectionName: 'profileViewerMetadata', documentIds: ['profileAnalytics'] },
  { collectionName: 'connectionInvites' },
] as const;

const ANALYTICS_STORAGE_KEYS = [
  'mfp_profile_analytics_sync_v4',
  'mfp_profile_analytics_sync_v5',
  'mfp_profile_analytics_sync_v6',
  'mfp_profile_analytics_ssi_diagnostics_v1',
  'mfp_connection_invites_status_sync_v1',
  'mfp_linkedin_heavy_sync_lock_v1',
] as const;

const ANALYTICS_ALARMS = [PROFILE_ANALYTICS_ALARM_NAME, CONNECTION_INVITES_STATUS_ALARM_NAME] as const;

async function deleteDocuments(documentRefs: DocumentReference[]): Promise<void> {
  for (let index = 0; index < documentRefs.length; index += DELETE_BATCH_SIZE) {
    const batch = writeBatch(getFirebaseDb());
    documentRefs.slice(index, index + DELETE_BATCH_SIZE).forEach((documentRef) => batch.delete(documentRef));
    await batch.commit();
  }
}

export interface ProfileAnalyticsDevResetResult {
  userId: string;
  deletedDocuments: number;
  deletedByCollection: Record<string, number>;
}

/**
 * Development-only destructive reset for the current signed-in test user.
 * Auth, the root user document, feeds, settings, and every other user remain untouched.
 */
export async function resetCurrentUserAnalyticsForDevelopment(): Promise<ProfileAnalyticsDevResetResult> {
  if (!__MFP_DEV_BUILD__) {
    throw new Error('Analytics reset is available only in a development extension build.');
  }

  const user = await getAuthenticatedFeedsUser();
  if (!user) {
    throw new Error('Sign in to myFeedPilot before resetting analytics test data.');
  }

  const snapshots = await Promise.all(
    ANALYTICS_COLLECTION_TARGETS.map(async (target) => {
      const snapshot = await getDocs(collection(getFirebaseDb(), 'users', user.uid, target.collectionName));
      const allowedDocumentIds = 'documentIds' in target ? new Set<string>(target.documentIds) : null;
      const documents = allowedDocumentIds
        ? snapshot.docs.filter((document) => allowedDocumentIds.has(document.id))
        : snapshot.docs;

      return {
        collectionName: target.collectionName,
        documents,
      };
    })
  );
  const documentRefs = snapshots.flatMap(({ documents }) => documents.map((document) => document.ref));

  await deleteDocuments(documentRefs);
  await Promise.all(ANALYTICS_ALARMS.map((alarmName) => chrome.alarms?.clear(alarmName)));
  await chrome.storage.local.remove([...ANALYTICS_STORAGE_KEYS]);

  const deletedByCollection = Object.fromEntries(
    snapshots.map(({ collectionName, documents }) => [collectionName, documents.length])
  );
  console.info('[profile-analytics-dev] current user analytics reset', {
    userId: user.uid,
    deletedDocuments: documentRefs.length,
    deletedByCollection,
  });

  return {
    userId: user.uid,
    deletedDocuments: documentRefs.length,
    deletedByCollection,
  };
}
