import { subscribeFeedShares } from 'shared/firestore-service';
import type { FeedShareAccess, UserProfile } from 'shared/types';
import { onAuthChange } from '../../../../services/auth';
import { getAuthenticatedFeedsUser } from '../../auth/services/authenticated-user';

type FeedShareRecipient = FeedShareAccess & UserProfile;

interface FeedSharesWatcher {
  ownerId: string;
  feedId: string;
  tabIds: Set<number>;
  shares: FeedShareRecipient[];
  unsubscribe: () => void;
}

const watchers = new Map<string, FeedSharesWatcher>();
let runtimeRegistered = false;

function watcherKey(ownerId: string, feedId: string): string {
  return `${ownerId}:${feedId}`;
}

async function notifyWatchingTabs(watcher: FeedSharesWatcher): Promise<void> {
  await Promise.all(
    [...watcher.tabIds].map((tabId) =>
      chrome.tabs
        .sendMessage(tabId, {
          type: 'FEEDS_FEED_SHARES_UPDATED',
          ownerId: watcher.ownerId,
          feedId: watcher.feedId,
          shares: watcher.shares,
        })
        .catch(() => {
          watcher.tabIds.delete(tabId);
        })
    )
  );

  if (watcher.tabIds.size === 0) {
    stopWatcher(watcherKey(watcher.ownerId, watcher.feedId));
  }
}

function stopWatcher(key: string): void {
  const watcher = watchers.get(key);
  if (!watcher) return;
  watcher.unsubscribe();
  watchers.delete(key);
}

export function stopAllFeedSharesRuntime(): void {
  [...watchers.keys()].forEach(stopWatcher);
}

export async function startFeedSharesRuntime(feedId: string, tabId: number): Promise<FeedShareRecipient[]> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) throw new Error('Sign in to manage shared feeds.');

  const key = watcherKey(user.uid, feedId);
  const existing = watchers.get(key);
  if (existing) {
    existing.tabIds.add(tabId);
    return existing.shares;
  }

  const watcher: FeedSharesWatcher = {
    ownerId: user.uid,
    feedId,
    tabIds: new Set([tabId]),
    shares: [],
    unsubscribe: () => undefined,
  };
  watchers.set(key, watcher);
  watcher.unsubscribe = subscribeFeedShares(
    user.uid,
    feedId,
    (shares) => {
      watcher.shares = shares;
      void notifyWatchingTabs(watcher);
    },
    (error) => {
      console.warn('[feed-sharing] Feed shares listener stopped', {
        feedId,
        error: error.message,
      });
      stopWatcher(key);
    }
  );

  return watcher.shares;
}

export function stopFeedSharesRuntime(feedId: string, tabId: number): void {
  const watcher = [...watchers.values()].find((candidate) => candidate.feedId === feedId);
  if (!watcher) return;
  watcher.tabIds.delete(tabId);
  if (watcher.tabIds.size === 0) {
    stopWatcher(watcherKey(watcher.ownerId, watcher.feedId));
  }
}

export function registerFeedSharesRuntime(): void {
  if (runtimeRegistered) return;
  runtimeRegistered = true;

  onAuthChange(() => stopAllFeedSharesRuntime());
  chrome.tabs.onRemoved.addListener((tabId) => {
    [...watchers.values()].forEach((watcher) => {
      watcher.tabIds.delete(tabId);
      if (watcher.tabIds.size === 0) {
        stopWatcher(watcherKey(watcher.ownerId, watcher.feedId));
      }
    });
  });
}
