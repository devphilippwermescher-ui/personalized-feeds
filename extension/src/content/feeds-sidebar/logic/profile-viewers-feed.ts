import type { FeedInfo, FeedMemberInfo, UserInfo } from '../types';
import type { ProfileViewerListItem, ProfileViewerSummary } from 'shared/types';

export const PROFILE_VIEWERS_FEED_ID = '__profile_viewers__';
const DEFAULT_RECRUITER_VIEWERS_URL =
  'https://www.linkedin.com/analytics/recruiter-views/?timeRange=WvmpSearchFilterTimeRange_LAST_90_DAYS';

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

export function buildRecruiterAggregateMember(
  summary?: ProfileViewerSummary | null
): FeedMemberInfo | null {
  const recruiterViewerCount =
    summary &&
    Number.isSafeInteger(summary.recruiterViewerCount) &&
    (summary.recruiterViewerCount || 0) > 0
      ? summary.recruiterViewerCount
      : undefined;

  if (!recruiterViewerCount) {
    return null;
  }

  const recruiterViewerUrl =
    typeof summary?.recruiterViewerUrl === 'string' && summary.recruiterViewerUrl.trim()
      ? summary.recruiterViewerUrl.trim()
      : DEFAULT_RECRUITER_VIEWERS_URL;

  return {
    id: '__profile_viewers_recruiters__',
    itemType: 'recruiterAggregate',
    linkedinUrl: recruiterViewerUrl,
    linkedinUsername: '',
    displayName: `${recruiterViewerCount} ${
      recruiterViewerCount === 1 ? 'recruiter' : 'recruiters'
    } viewed your profile`,
    addedAt: summary?.updatedAt || Date.now(),
  };
}

export function withProfileViewersFeed(
  feeds: FeedInfo[],
  members: FeedMemberInfo[],
  privateViewerCount: number | undefined,
  recruiterViewerCount: number | undefined,
  currentUser: UserInfo | null
): FeedInfo[] {
  if (!currentUser) {
    return feeds.filter((feed) => feed.id !== PROFILE_VIEWERS_FEED_ID);
  }

  const existingProfileViewersFeed = feeds.find((feed) => feed.id === PROFILE_VIEWERS_FEED_ID);
  const profileViewersFeed: FeedInfo = {
    id: PROFILE_VIEWERS_FEED_ID,
    name: 'Profile Visitors',
    description: 'Auto-saved LinkedIn profile viewers',
    color: '#0A66C2',
    memberCount: members.length,
    privateViewerCount,
    recruiterViewerCount,
    sortOrder: -1,
    ownerId: currentUser.userId,
    isSystem: true,
    systemType: 'profileViewers',
    isRefreshingProfileViewers: existingProfileViewersFeed?.isRefreshingProfileViewers,
    isConfirmingProfileViewersRefresh:
      existingProfileViewersFeed?.isConfirmingProfileViewersRefresh,
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
  const recruiterViewerCount =
    params.summary &&
    Number.isSafeInteger(params.summary.recruiterViewerCount) &&
    (params.summary.recruiterViewerCount || 0) > 0
      ? params.summary.recruiterViewerCount
      : undefined;
  const recruiterAggregateMember = buildRecruiterAggregateMember(params.summary);
  const membersWithRecruiterAggregate =
    recruiterAggregateMember
      ? [recruiterAggregateMember, ...members]
      : members;

  return {
    members: membersWithRecruiterAggregate,
    privateViewerCount,
    feeds: withProfileViewersFeed(
      params.feeds,
      membersWithRecruiterAggregate,
      privateViewerCount,
      recruiterViewerCount,
      params.currentUser
    ),
    feedMembersById: {
      ...params.feedMembersById,
      [PROFILE_VIEWERS_FEED_ID]: membersWithRecruiterAggregate,
    },
  };
}
