export interface Feed {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  ownerId: string;
  shareToken?: string;
  /** Total persisted members remain available after a downgrade. */
  activeMemberCount?: number;
  lockedMemberCount?: number;
  isLockedByPlan?: boolean;
}

export type FeedShareRole = 'reader' | 'editor';

export interface FeedShareAccess {
  targetUid: string;
  targetEmail: string;
  role: FeedShareRole;
  createdAt: number;
  updatedAt: number;
}

export type SharingLimitDirection = 'outgoing' | 'incoming';
export type SharingLimitDimension = 'people' | 'feeds';
export type SharingBlockedParty = 'current_user' | 'counterparty';

export interface SharingLimitDetails {
  code: 'SHARING_LIMIT_REACHED';
  direction: SharingLimitDirection;
  dimension: SharingLimitDimension;
  blockedParty: SharingBlockedParty;
  limit: 1 | 3;
  counterpartDisplayName?: string;
  notificationCreated: boolean;
}

export type ShareNotificationKind =
  | 'incoming_share_added'
  | 'incoming_share_blocked'
  | 'link_follow_blocked_owner'
  | 'link_follow_blocked_recipient';

export interface ShareNotification {
  id: string;
  kind: ShareNotificationKind;
  status: 'pending' | 'unread' | 'accepted' | 'dismissed' | 'expired';
  ownerId: string;
  recipientId: string;
  feedId: string;
  feedName: string;
  ownerDisplayName: string;
  recipientDisplayName: string;
  role: FeedShareRole;
  limitDirection?: SharingLimitDirection;
  limitDimension?: SharingLimitDimension;
  createdAt: number;
  updatedAt: number;
}

export interface FollowedFeed {
  id: string;
  ownerId: string;
  feedId: string;
  role: FeedShareRole;
  followedAt: number;
  sortOrder?: number;
}

export interface SharedFeedSummary extends Feed {
  role: FeedShareRole;
  previousRole?: FeedShareRole;
  ownerDisplayName: string;
  ownerEmail: string;
  ownerPhotoURL?: string;
  followedAt: number;
  followedFeedId?: string;
  followedSortOrder?: number;
}

export interface FeedMember {
  id: string;
  linkedinUrl: string;
  linkedinUsername: string;
  profileUrn?: string;
  memberNumericId?: string;
  canMessage?: boolean;
  canFollow?: boolean;
  canConnect?: boolean;
  isFollowing?: boolean;
  isPremium?: boolean;
  displayName: string;
  headline?: string;
  profileImageUrl?: string;
  email?: string;
  company?: string;
  location?: string;
  connectionDegree?: string;
  status?: 'connected' | 'pending' | 'connect' | 'following' | 'withdrawn' | 'unavailable';
  addedAt: number;
  isLockedByPlan?: boolean;
}

export interface FeedPlanPolicy {
  ownerPlan: 'free' | 'pro';
  isFeedLocked: boolean;
  maxMembersPerFeed: number | null;
}

export interface LinkedInProfileData {
  linkedinUrl: string;
  linkedinUsername: string;
  profileUrn?: string;
  memberNumericId?: string;
  canMessage?: boolean;
  canFollow?: boolean;
  canConnect?: boolean;
  isFollowing?: boolean;
  displayName: string;
  headline?: string;
  profileImageUrl?: string;
  company?: string;
  location?: string;
  connectionDegree?: string;
  connectionsCount?: number;
  followersCount?: number;
  memberId?: string;
}

export type FeedWithMembers = Feed & {
  members: FeedMember[];
};
