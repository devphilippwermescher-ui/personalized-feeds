import type {
  ProfileAnalyticsConnectionInvite,
  ProfileAnalyticsDailySnapshot,
  ProfileAnalyticsSnapshot,
  ProfileViewer,
  ProfileViewerSummary,
} from 'shared/types';

const DATABASE_NAME = 'myfeedpilot-dashboard';
const DATABASE_VERSION = 1;
const STORE_NAME = 'profile-analytics';
const CACHE_VERSION = 1;

export interface ProfileAnalyticsCacheData {
  snapshot: ProfileAnalyticsSnapshot | null;
  dailySnapshots: ProfileAnalyticsDailySnapshot[];
  profileViewers: ProfileViewer[];
  profileViewerSummary: ProfileViewerSummary | null;
  connectionInvites: ProfileAnalyticsConnectionInvite[];
}

interface ProfileAnalyticsCacheRecord extends ProfileAnalyticsCacheData {
  version: typeof CACHE_VERSION;
  userId: string;
  cachedAt: number;
}

function openCacheDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Profile Analytics cache could not be opened.'));
  });
}

function runCacheRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | undefined> {
  return openCacheDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        if (!database) {
          resolve(undefined);
          return;
        }

        const transaction = database.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Profile Analytics cache request failed.'));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
          database.close();
          reject(transaction.error || new Error('Profile Analytics cache transaction failed.'));
        };
      })
  );
}

export async function readProfileAnalyticsCache(userId: string): Promise<ProfileAnalyticsCacheData | null> {
  try {
    const record = await runCacheRequest<ProfileAnalyticsCacheRecord>('readonly', (store) => store.get(userId));
    if (!record || record.version !== CACHE_VERSION || record.userId !== userId) return null;
    return {
      snapshot: record.snapshot || null,
      dailySnapshots: Array.isArray(record.dailySnapshots) ? record.dailySnapshots : [],
      profileViewers: Array.isArray(record.profileViewers) ? record.profileViewers : [],
      profileViewerSummary: record.profileViewerSummary || null,
      connectionInvites: Array.isArray(record.connectionInvites) ? record.connectionInvites : [],
    };
  } catch {
    return null;
  }
}

export async function writeProfileAnalyticsCache(
  userId: string,
  data: ProfileAnalyticsCacheData
): Promise<void> {
  try {
    await runCacheRequest('readwrite', (store) =>
      store.put({
        version: CACHE_VERSION,
        userId,
        cachedAt: Date.now(),
        ...data,
      } satisfies ProfileAnalyticsCacheRecord)
    );
  } catch {
    // Firestore remains authoritative. A local cache failure must not block the dashboard.
  }
}

export async function deleteProfileAnalyticsCache(userId: string): Promise<void> {
  try {
    await runCacheRequest('readwrite', (store) => store.delete(userId));
  } catch {
    // The next live Firestore result will replace any stale in-memory values.
  }
}
