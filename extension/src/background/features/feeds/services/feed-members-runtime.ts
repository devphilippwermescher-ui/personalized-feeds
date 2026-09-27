import { subscribeFeedMembers } from 'shared/firestore-service';
import type { FeedMember } from 'shared/types';
import { onAuthChange } from '../../../../services/auth';
import { getAuthenticatedFeedsUser } from '../../auth/services/authenticated-user';
import { projectFeedMembersForPlanAccess } from '../../plans/public';

interface FeedMembersWatcher {
  authenticatedUserId: string;
  ownerId: string;
  feedId: string;
  tabIds: Set<number>;
  snapshotVersion: number;
  unsubscribe: () => void;
}

const watchers = new Map<string, FeedMembersWatcher>();
let runtimeRegistered = false;

function watcherKey(authenticatedUserId: string, ownerId: string, feedId: string): string {
  return `${authenticatedUserId}:${ownerId}:${feedId}`;
}

function stopWatcher(key: string): void {
  const watcher = watchers.get(key);
  if (!watcher) return;
  watcher.unsubscribe();
  watchers.delete(key);
}

async function notifyWatchingTabs(watcher: FeedMembersWatcher, members: FeedMember[]): Promise<void> {
  await Promise.all(
    [...watcher.tabIds].map((tabId) =>
      chrome.tabs
        .sendMessage(tabId, {
          type: 'FEEDS_MEMBERS_UPDATED',
          ownerId: watcher.ownerId,
          feedId: watcher.feedId,
          memberCount: members.length,
          members,
        })
        .catch(() => {
          watcher.tabIds.delete(tabId);
        })
    )
  );

  if (watcher.tabIds.size === 0) {
    stopWatcher(watcherKey(watcher.authenticatedUserId, watcher.ownerId, watcher.feedId));
  }
}

export function stopAllFeedMembersRuntime(): void {
  [...watchers.keys()].forEach(stopWatcher);
}

export async function startFeedMembersRuntime(ownerId: string, feedId: string, tabId: number): Promise<void> {
  const user = await getAuthenticatedFeedsUser();
  if (!user) throw new Error('Sign in to watch feed members.');

  const key = watcherKey(user.uid, ownerId, feedId);
  const existing = watchers.get(key);
  if (existing) {
    existing.tabIds.add(tabId);
    return;
  }

  const watcher: FeedMembersWatcher = {
    authenticatedUserId: user.uid,
    ownerId,
    feedId,
    tabIds: new Set([tabId]),
    snapshotVersion: 0,
    unsubscribe: () => undefined,
  };
  watchers.set(key, watcher);
  watcher.unsubscribe = subscribeFeedMembers(
    ownerId,
    feedId,
    (rawMembers) => {
      const version = ++watcher.snapshotVersion;
      void projectFeedMembersForPlanAccess(user.uid, ownerId, feedId, rawMembers)
        .then((members) => {
          if (watchers.get(key) !== watcher || version !== watcher.snapshotVersion) return;
          return notifyWatchingTabs(watcher, members);
        })
        .catch((error) => {
          console.warn('[feeds] Could not project realtime feed members', {
            ownerId,
            feedId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    },
    (error) => {
      console.warn('[feeds] Feed members listener stopped', { ownerId, feedId, error: error.message });
      stopWatcher(key);
    }
  );
}

export function stopFeedMembersRuntime(ownerId: string, feedId: string, tabId: number): void {
  const watcher = [...watchers.values()].find(
    (candidate) => candidate.ownerId === ownerId && candidate.feedId === feedId && candidate.tabIds.has(tabId)
  );
  if (!watcher) return;

  watcher.tabIds.delete(tabId);
  if (watcher.tabIds.size === 0) {
    stopWatcher(watcherKey(watcher.authenticatedUserId, watcher.ownerId, watcher.feedId));
  }
}

export function registerFeedMembersRuntime(): void {
  if (runtimeRegistered) return;
  runtimeRegistered = true;

  onAuthChange(() => stopAllFeedMembersRuntime());
  chrome.tabs.onRemoved.addListener((tabId) => {
    [...watchers.values()].forEach((watcher) => {
      watcher.tabIds.delete(tabId);
      if (watcher.tabIds.size === 0) {
        stopWatcher(watcherKey(watcher.authenticatedUserId, watcher.ownerId, watcher.feedId));
      }
    });
  });
}
