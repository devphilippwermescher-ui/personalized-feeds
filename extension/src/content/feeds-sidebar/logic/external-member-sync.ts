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
  fetchLinkedInRelationshipStatus: (member: FeedMemberInfo) => Promise<Partial<FeedMemberInfo>>;
  updateRenderedMemberState: (feedId: string, member: FeedMemberInfo) => boolean;
  getActiveMemberEditor: () => { feedId: string; member: FeedMemberInfo } | null;
  setActiveMemberEditor: (value: null) => void;
}

let listenerAttached = false;

function canPatchMemberRows(currentMembers: FeedMemberInfo[], nextMembers: FeedMemberInfo[]): boolean {
  return (
    currentMembers.length === nextMembers.length &&
    currentMembers.every((currentMember, index) => {
      const nextMember = nextMembers[index];
      return (
        nextMember?.id === currentMember.id &&
        nextMember.itemType === currentMember.itemType &&
        nextMember.isLockedByPlan === currentMember.isLockedByPlan &&
        nextMember.headline === currentMember.headline &&
        nextMember.viewedAgoText === currentMember.viewedAgoText &&
        nextMember.mutualConnectionsText === currentMember.mutualConnectionsText &&
        nextMember.searchKey === currentMember.searchKey
      );
    })
  );
}

function getFeedPreviewSignature(members: FeedMemberInfo[]): string {
  return JSON.stringify(
    members
      .filter((member) => !member.isLockedByPlan)
      .slice(0, 3)
      .map((member) => ({
        id: member.id,
        itemType: member.itemType,
        displayName: member.displayName,
        profileImageUrl: member.profileImageUrl,
      }))
  );
}

export function insertAddedMemberIntoCache(
  existingMembers: FeedMemberInfo[],
  incomingMember: FeedMemberInfo
): FeedMemberInfo[] {
  const incomingUsername = getCanonicalLinkedInUsername(incomingMember);
  const exists = existingMembers.some(
    (member) => member.id === incomingMember.id || getCanonicalLinkedInUsername(member) === incomingUsername
  );

  if (exists) {
    return existingMembers;
  }

  return [incomingMember, ...existingMembers].sort((left, right) => (right.addedAt || 0) - (left.addedAt || 0));
}

export function applyRealtimeFeedMembers(
  detail: { ownerId: string; feedId: string; memberCount: number; members: FeedMemberInfo[] },
  deps: Pick<
    ExternalMemberSyncDeps,
    | 'getFeeds'
    | 'setFeeds'
    | 'getSharedFeeds'
    | 'setSharedFeeds'
    | 'getFeedMembersById'
    | 'setFeedMembersById'
    | 'getExpandedFeedId'
    | 'updateRenderedMemberState'
    | 'getActiveMemberEditor'
    | 'setActiveMemberEditor'
    | 'renderSidebarContent'
  >
): boolean {
  const matchesFeed = (feed: FeedInfo): boolean => feed.id === detail.feedId && feed.ownerId === detail.ownerId;
  const currentFeed = [...deps.getFeeds(), ...deps.getSharedFeeds()].find(matchesFeed);
  if (!currentFeed) return false;

  const activeMemberCount = detail.members.filter((member) => !member.isLockedByPlan).length;
  const lockedMemberCount = Math.max(0, detail.memberCount - activeMemberCount);
  const updateFeed = (feed: FeedInfo): FeedInfo =>
    matchesFeed(feed)
      ? {
          ...feed,
          memberCount: detail.memberCount,
          activeMemberCount,
          lockedMemberCount,
        }
      : feed;
  const currentMembers = deps.getFeedMembersById()[detail.feedId] || [];
  const expandedFeedId = deps.getExpandedFeedId();
  const canPatchExpandedFeed = expandedFeedId === detail.feedId && canPatchMemberRows(currentMembers, detail.members);
  const collapsedPresentationChanged =
    currentFeed.memberCount !== detail.memberCount ||
    (currentFeed.activeMemberCount ?? currentFeed.memberCount) !== activeMemberCount ||
    (currentFeed.lockedMemberCount ?? 0) !== lockedMemberCount ||
    getFeedPreviewSignature(currentMembers) !== getFeedPreviewSignature(detail.members);

  deps.setFeeds(deps.getFeeds().map(updateFeed));
  deps.setSharedFeeds(deps.getSharedFeeds().map(updateFeed));
  deps.setFeedMembersById({
    ...deps.getFeedMembersById(),
    [detail.feedId]: detail.members,
  });

  const activeEditor = deps.getActiveMemberEditor();
  if (
    activeEditor?.feedId === detail.feedId &&
    !detail.members.some((member) => member.id === activeEditor.member.id)
  ) {
    deps.setActiveMemberEditor(null);
  }

  if (canPatchExpandedFeed && detail.members.every((member) => deps.updateRenderedMemberState(detail.feedId, member))) {
    return true;
  }

  if (expandedFeedId !== detail.feedId && !collapsedPresentationChanged) {
    return true;
  }

  deps.renderSidebarContent();
  return true;
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
      if (deps.getExpandedFeedId() === detail.feedId && !deps.getFeedMembersById()[detail.feedId]) {
        await deps.loadFeedMembers(detail.feedId);
      }
      deps.renderSidebarContent();
      return;
    }

    const incrementMemberCount = (feed: FeedInfo): FeedInfo =>
      feed.id === detail.feedId ? { ...feed, memberCount: (feed.memberCount || 0) + 1 } : feed;
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
    Object.assign(memberWithLoadingState, await deps.fetchLinkedInRelationshipStatus(memberWithLoadingState));
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

  chrome.runtime.onMessage.addListener((message) => {
    if (
      message.type !== 'FEEDS_MEMBERS_UPDATED' ||
      typeof message.ownerId !== 'string' ||
      typeof message.feedId !== 'string' ||
      typeof message.memberCount !== 'number' ||
      !Array.isArray(message.members)
    ) {
      return;
    }

    applyRealtimeFeedMembers(
      {
        ownerId: message.ownerId,
        feedId: message.feedId,
        memberCount: message.memberCount,
        members: message.members as FeedMemberInfo[],
      },
      deps
    );
  });
}
