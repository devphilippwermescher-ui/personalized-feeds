import type {
  ContentAnalyticsDailySnapshot,
  ContentAnalyticsPost,
  ContentAnalyticsRangeSnapshot,
  ContentAnalyticsSnapshot,
  DashboardAnalyticsSyncManifest,
} from 'shared/types';

const DATABASE_NAME = 'myfeedpilot-dashboard-content';
const DATABASE_VERSION = 1;
const STORE_NAME = 'content-analytics';
const CACHE_VERSION = 1;

export interface ContentAnalyticsCacheData {
  snapshot: ContentAnalyticsSnapshot | null;
  ranges: ContentAnalyticsRangeSnapshot[];
  dailySnapshots: ContentAnalyticsDailySnapshot[];
  posts: ContentAnalyticsPost[];
  syncManifest: DashboardAnalyticsSyncManifest | null;
}

interface ContentAnalyticsCacheRecord extends ContentAnalyticsCacheData {
  version: typeof CACHE_VERSION;
  userId: string;
  cachedAt: number;
}

export function createEmptyContentAnalyticsCacheData(): ContentAnalyticsCacheData {
  return { snapshot: null, ranges: [], dailySnapshots: [], posts: [], syncManifest: null };
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
    request.onerror = () => reject(request.error || new Error('Content Analytics cache could not be opened.'));
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
        request.onerror = () => reject(request.error || new Error('Content Analytics cache request failed.'));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
          database.close();
          reject(transaction.error || new Error('Content Analytics cache transaction failed.'));
        };
      })
  );
}

/** Cache reads never throw: a missing or unreadable cache just means no data yet. */
export async function readContentAnalyticsCache(userId: string): Promise<ContentAnalyticsCacheData | null> {
  try {
    const record = await runCacheRequest<ContentAnalyticsCacheRecord>('readonly', (store) => store.get(userId));
    if (!record || record.version !== CACHE_VERSION || record.userId !== userId) return null;
    return {
      snapshot: record.snapshot || null,
      ranges: Array.isArray(record.ranges) ? record.ranges : [],
      dailySnapshots: Array.isArray(record.dailySnapshots) ? record.dailySnapshots : [],
      posts: Array.isArray(record.posts) ? record.posts : [],
      syncManifest: record.syncManifest || null,
    };
  } catch {
    return null;
  }
}

export async function writeContentAnalyticsCache(
  userId: string,
  data: ContentAnalyticsCacheData
): Promise<void> {
  try {
    const record: ContentAnalyticsCacheRecord = {
      ...data,
      version: CACHE_VERSION,
      userId,
      cachedAt: Date.now(),
    };
    await runCacheRequest('readwrite', (store) => store.put(record));
  } catch {
    // A full or unavailable IndexedDB must never break the page.
  }
}

export async function deleteContentAnalyticsCache(userId: string): Promise<void> {
  try {
    await runCacheRequest('readwrite', (store) => store.delete(userId));
  } catch {
    // Nothing to clean up when the cache is unavailable.
  }
}
