import type { FeedInfo, FeedMemberInfo } from '../types';
import { FEED_MEMBER_ADDED_EVENT } from '../sync-events';
import { getMemberStatus } from '../utils';
import { getCanonicalLinkedInUsername } from '../../../../../shared/linkedin-identity';

interface ExternalMemberSyncDeps {
  getFeeds: () => FeedInfo[];
  setFeeds: (feeds: FeedInfo[]) => void;
  getSharedFeeds: () => FeedInfo[];
  setSharedFeeds: (feeds: FeedInfo[]) => void;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  setFeedMembersById: (members: Record<string, FeedMemberInfo[]>) => void;
  getExpandedFeedId: () => string | null;
  loadFeeds: () => Promise<void>;
  loadFeedMembers: (feedId: string) => Promise<void>;
  renderSidebarContent: () => void;
  fetchLinkedInRelationshipStatus: (
    member: FeedMemberInfo
  ) => Promise<Partial<FeedMemberInfo>>;
  updateRenderedMemberState: (feedId: string, member: FeedMemberInfo) => boolean;
}

let listenerAttached = false;

export function insertAddedMemberIntoCache(
  existingMembers: FeedMemberInfo[],
  incomingMember: FeedMemberInfo
): FeedMemberInfo[] {
  const incomingUsername = getCanonicalLinkedInUsername(incomingMember);
  const exists = existingMembers.some(
    (member) =>
      member.id === incomingMember.id ||
      getCanonicalLinkedInUsername(member) === incomingUsername
  );

  if (exists) {
    return existingMembers;
  }

  return [incomingMember, ...existingMembers].sort(
    (left, right) => (right.addedAt || 0) - (left.addedAt || 0)
  );
}

async function handleExternalMemberAdded(
  detail: { feedId: string; feedName: string; member: FeedMemberInfo },
  deps: ExternalMemberSyncDeps
): Promise<void> {
  const cachedMembers = deps.getFeedMembersById()[detail.feedId];
  const hasCompleteLocalCache = Array.isArray(cachedMembers);
  const existingMembers = cachedMembers || [];
  const memberWithLoadingState: FeedMemberInfo = {
    ...detail.member,
    linkedinUsername: getCanonicalLinkedInUsername(detail.member),
    status: 'loading',
  };
  const nextMembers = insertAddedMemberIntoCache(existingMembers, memberWithLoadingState);
  const exists = nextMembers === existingMembers;

  if (!exists) {
    if (!hasCompleteLocalCache) {
      await deps.loadFeeds();
      if (
        deps.getExpandedFeedId() === detail.feedId &&
        !deps.getFeedMembersById()[detail.feedId]
      ) {
        await deps.loadFeedMembers(detail.feedId);
      }
      deps.renderSidebarContent();
      return;
    }

    const incrementMemberCount = (feed: FeedInfo): FeedInfo =>
      feed.id === detail.feedId
        ? { ...feed, memberCount: (feed.memberCount || 0) + 1 }
        : feed;
    deps.setFeeds(deps.getFeeds().map(incrementMemberCount));
    deps.setSharedFeeds(deps.getSharedFeeds().map(incrementMemberCount));
    deps.setFeedMembersById({
      ...deps.getFeedMembersById(),
      [detail.feedId]: nextMembers,
    });
  }
  deps.renderSidebarContent();

  if (deps.getExpandedFeedId() === detail.feedId) {
    await deps.loadFeedMembers(detail.feedId);
    return;
  }

  try {
    Object.assign(
      memberWithLoadingState,
      await deps.fetchLinkedInRelationshipStatus(memberWithLoadingState)
    );
  } catch {
    memberWithLoadingState.status = undefined;
    memberWithLoadingState.status = getMemberStatus(memberWithLoadingState);
  }

  if (!deps.updateRenderedMemberState(detail.feedId, memberWithLoadingState)) {
    deps.renderSidebarContent();
  }
}

export function attachFeedSyncListeners(deps: ExternalMemberSyncDeps): void {
  if (listenerAttached) {
    return;
  }

  listenerAttached = true;
  window.addEventListener(FEED_MEMBER_ADDED_EVENT, ((event: Event) => {
    const customEvent = event as CustomEvent<{
      feedId: string;
      feedName: string;
      member: FeedMemberInfo;
    }>;
    if (customEvent.detail) {
      void handleExternalMemberAdded(customEvent.detail, deps);
    }
  }) as EventListener);
}
