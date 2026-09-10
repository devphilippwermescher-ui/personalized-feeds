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
}

export type FeedShareRole = 'reader' | 'editor';

export interface FeedShareAccess {
  targetUid: string;
  targetEmail: string;
  role: FeedShareRole;
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
