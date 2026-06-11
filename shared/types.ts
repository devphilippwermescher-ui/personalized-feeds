export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: number;
}

export interface UserFeatureSettings {
  messagingButtons: boolean;
  postButtons: boolean;
  speechToComment: boolean;
}

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

export interface ProfileViewer {
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
  connectionDegree?: string;
  viewedAgoText?: string;
  mutualConnectionsText?: string;
  status?: 'connected' | 'pending' | 'connect' | 'following' | 'withdrawn' | 'unavailable' | 'loading';
  firstSeenAt: number;
  lastSeenAt: number;
  lastSeenPosition?: number;
  source: 'linkedin_profile_views';
}

export type ProfileViewerInput = Omit<
  ProfileViewer,
  'id' | 'firstSeenAt' | 'lastSeenAt' | 'lastSeenPosition' | 'source'
>;

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
}

export interface SharedFeedSummary extends Feed {
  role: FeedShareRole;
  ownerDisplayName: string;
  ownerEmail: string;
  ownerPhotoURL?: string;
  followedAt: number;
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
  memberId?: string;
}

export type FeedWithMembers = Feed & {
  members: FeedMember[];
};
