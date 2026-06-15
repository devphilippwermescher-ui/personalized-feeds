import type { FeedInfo, FeedMemberInfo, UserInfo } from '../types';
import type { ProfileViewerListItem, ProfileViewerSummary } from 'shared/types';

export const PROFILE_VIEWERS_FEED_ID = '__profile_viewers__';

export function normalizeSharedFeed(
  feed: FeedInfo & { role?: 'reader' | 'editor' }
): FeedInfo {
  return {
    ...feed,
    isShared: true,
    accessRole: feed.accessRole || feed.role,
  };
}

function profileViewerToMember(viewer: ProfileViewerListItem): FeedMemberInfo {
  if ('searchKey' in viewer) {
    return {
      id: viewer.id,
      itemType: 'search',
      searchKey: viewer.searchKey,
      linkedinUrl: viewer.searchUrl,
      linkedinUsername: '',
      displayName: viewer.displayName,
      viewedAgoText: viewer.viewedAgoText || '',
      addedAt: viewer.lastSeenAt,
      firstSeenAt: viewer.firstSeenAt,
      lastSeenAt: viewer.lastSeenAt,
    };
  }

  return {
    id: viewer.id,
    itemType: 'profile',
    linkedinUrl: viewer.linkedinUrl,
    linkedinUsername: viewer.linkedinUsername,
    profileUrn: viewer.profileUrn,
    memberNumericId: viewer.memberNumericId,
    canMessage: viewer.canMessage,
    canFollow: viewer.canFollow,
    canConnect: viewer.canConnect,
    isFollowing: viewer.isFollowing,
    isPremium: viewer.isPremium,
    displayName: viewer.displayName,
    headline: viewer.headline || '',
    profileImageUrl: viewer.profileImageUrl || '',
    connectionDegree: viewer.connectionDegree || '',
    viewedAgoText: viewer.viewedAgoText || '',
    mutualConnectionsText: viewer.mutualConnectionsText || '',
    status: viewer.status,
    firstSeenAt: viewer.firstSeenAt,
    lastSeenAt: viewer.lastSeenAt,
    addedAt: viewer.lastSeenAt,
  };
}

export function withProfileViewersFeed(
  feeds: FeedInfo[],
  members: FeedMemberInfo[],
  privateViewerCount: number | undefined,
  currentUser: UserInfo | null
): FeedInfo[] {
  if (!currentUser) {
    return feeds.filter((feed) => feed.id !== PROFILE_VIEWERS_FEED_ID);
  }

  const profileViewersFeed: FeedInfo = {
    id: PROFILE_VIEWERS_FEED_ID,
    name: 'Profile Visitors',
    description: 'Auto-saved LinkedIn profile viewers',
    color: '#0A66C2',
    memberCount: members.length,
    privateViewerCount,
    sortOrder: -1,
    ownerId: currentUser.userId,
    isSystem: true,
    systemType: 'profileViewers',
  };

  return [
    profileViewersFeed,
    ...feeds.filter((feed) => feed.id !== PROFILE_VIEWERS_FEED_ID),
  ];
}

export function buildProfileViewersState(params: {
  viewers: ProfileViewerListItem[];
  summary?: ProfileViewerSummary | null;
  feeds: FeedInfo[];
  feedMembersById: Record<string, FeedMemberInfo[]>;
  currentUser: UserInfo | null;
}): {
  members: FeedMemberInfo[];
  privateViewerCount: number | undefined;
  feeds: FeedInfo[];
  feedMembersById: Record<string, FeedMemberInfo[]>;
} {
  const members = params.viewers.map(profileViewerToMember);
  const privateViewerCount =
    params.summary &&
    Number.isSafeInteger(params.summary.privateViewerCount) &&
    params.summary.privateViewerCount >= 0
      ? params.summary.privateViewerCount
      : undefined;

  return {
    members,
    privateViewerCount,
    feeds: withProfileViewersFeed(
      params.feeds,
      members,
      privateViewerCount,
      params.currentUser
    ),
    feedMembersById: {
      ...params.feedMembersById,
      [PROFILE_VIEWERS_FEED_ID]: members,
    },
  };
}
