import type { FeedInfo } from '../types';

type SharedFeedRoleSnapshot = Record<string, 'reader' | 'editor'>;

const SHARED_FEED_ROLE_STORAGE_PREFIX = 'lfa_shared_feed_roles';

function getStorageKey(userId: string | undefined): string | null {
  return userId ? `${SHARED_FEED_ROLE_STORAGE_PREFIX}:${userId}` : null;
}

function getSnapshotKey(feed: FeedInfo): string | null {
  return feed.ownerId && feed.accessRole ? `${feed.ownerId}:${feed.id}` : null;
}

function buildSnapshot(feeds: FeedInfo[]): SharedFeedRoleSnapshot {
  return feeds.reduce<SharedFeedRoleSnapshot>((snapshot, feed) => {
    const key = getSnapshotKey(feed);
    if (key && feed.accessRole) snapshot[key] = feed.accessRole;
    return snapshot;
  }, {});
}

function readSnapshot(storageKey: string | null): Promise<SharedFeedRoleSnapshot> {
  if (!storageKey) return Promise.resolve({});

  return new Promise((resolve) => {
    chrome.storage.local.get([storageKey], (result) => {
      const stored = result[storageKey] as unknown;
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        resolve({});
        return;
      }

      const snapshot: SharedFeedRoleSnapshot = {};
      Object.entries(stored as Record<string, unknown>).forEach(([key, value]) => {
        if (value === 'reader' || value === 'editor') snapshot[key] = value;
      });
      resolve(snapshot);
    });
  });
}

function writeSnapshot(
  storageKey: string | null,
  snapshot: SharedFeedRoleSnapshot
): Promise<void> {
  if (!storageKey) return Promise.resolve();
  return new Promise((resolve) => {
    chrome.storage.local.set({ [storageKey]: snapshot }, () => resolve());
  });
}

export async function findChangedSharedFeedRole(
  userId: string | undefined,
  nextSharedFeeds: FeedInfo[]
): Promise<FeedInfo | undefined> {
  const storageKey = getStorageKey(userId);
  const previousSnapshot = await readSnapshot(storageKey);
  const changedFeed =
    nextSharedFeeds.find(
      (feed) =>
        feed.previousAccessRole &&
        feed.accessRole &&
        feed.previousAccessRole !== feed.accessRole
    ) ||
    nextSharedFeeds.find((feed) => {
      const key = getSnapshotKey(feed);
      return Boolean(key && previousSnapshot[key] && previousSnapshot[key] !== feed.accessRole);
    });

  await writeSnapshot(storageKey, buildSnapshot(nextSharedFeeds));
  return changedFeed;
}
