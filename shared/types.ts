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
  hideProfileViewers: boolean;
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
  statusResolvedAt?: number;
  statusCheckFailedAt?: number;
  statusCheckError?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastSeenPosition?: number;
  source: 'linkedin_profile_views';
}

export type ProfileViewerInput = Omit<
  ProfileViewer,
  'id' | 'firstSeenAt' | 'lastSeenAt' | 'lastSeenPosition' | 'source'
> & {
  sourceIndex?: number;
  listPosition?: number;
};

export interface ProfileViewerSearch {
  id: string;
  itemType: 'search';
  searchKey: string;
  searchUrl: string;
  displayName: string;
  keywords: string;
  currentCompany?: string;
  viewedAgoText?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastSeenPosition?: number;
  source: 'linkedin_profile_views';
}

export type ProfileViewerSearchInput = Omit<
  ProfileViewerSearch,
  'id' | 'firstSeenAt' | 'lastSeenAt' | 'lastSeenPosition' | 'source'
> & {
  sourceIndex?: number;
  listPosition?: number;
};

export type ProfileViewerListItem = ProfileViewer | ProfileViewerSearch;

export interface ProfileViewerSummary {
  privateViewerCount: number;
  recruiterViewerCount?: number;
  recruiterViewerUrl?: string;
  updatedAt: number;
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

export interface ProfileAnalyticsBreakdownItem {
  label: string;
  value?: number;
}

export interface ProfileAnalyticsProfileSnapshot {
  linkedinUrl: string;
  linkedinUsername: string;
  profileUrn?: string;
  memberNumericId?: string;
  displayName: string;
  headline?: string;
  profileImageUrl?: string;
  backgroundImageUrl?: string;
  company?: string;
  location?: string;
  connectionsCount?: number;
  /** Number of connections added on each LinkedIn connection date (YYYY-MM-DD). */
  connectionDateCounts?: Record<string, number>;
  /** True only after every connection page was read successfully. */
  connectionDateCountsComplete?: boolean;
  connectionDateCountsUpdatedAt?: number;
  connectionDateCountsError?: string;
  /** Recent identifiers used to stop incremental pagination at known data. */
  recentConnectionIds?: string[];
  followersCount?: number;
  updatedAt: number;
  sourceUrl: string;
}

export interface ProfileAnalyticsSearchAppearancesSnapshot {
  totalCount?: number;
  periodLabel?: string;
  topCompanies?: ProfileAnalyticsBreakdownItem[];
  topJobTitles?: ProfileAnalyticsBreakdownItem[];
  keywords?: ProfileAnalyticsBreakdownItem[];
  updatedAt: number;
  sourceUrl: string;
}

export interface ProfileAnalyticsSsiSnapshot {
  score?: number;
  updatedAt: number;
  sourceUrl: string;
}

export interface ProfileAnalyticsProfileViewsSnapshot {
  visibleCount: number;
  privateCount: number;
  recruiterCount?: number;
  totalCount: number;
  updatedAt: number;
  source: 'profile_viewers';
}

export interface ProfileAnalyticsAcceptanceSnapshot {
  sentCount: number;
  acceptedCount: number;
  rate: number;
  updatedAt: number;
  source: 'tracked_invites';
}

export interface ProfileAnalyticsConnectionInvite {
  id: string;
  kind: 'connectionInvite';
  linkedinUsername: string;
  linkedinUrl: string;
  displayName?: string;
  profileUrn?: string;
  memberNumericId?: string;
  sentAt: number;
  acceptedAt?: number;
  lastCheckedAt?: number;
  nextCheckAt?: number;
  checkAttempts?: number;
  status: 'sent' | 'accepted';
  source: 'sidebar_connect_action' | 'linkedin_native_connect_action' | 'linkedin_sent_invitations_sync';
}

export interface ProfileAnalyticsSnapshot {
  profile?: ProfileAnalyticsProfileSnapshot;
  profileViews?: ProfileAnalyticsProfileViewsSnapshot;
  searchAppearances?: ProfileAnalyticsSearchAppearancesSnapshot;
  socialSellingIndex?: ProfileAnalyticsSsiSnapshot;
  acceptanceRate?: ProfileAnalyticsAcceptanceSnapshot;
  updatedAt: number;
}

export interface ProfileAnalyticsDailySnapshot {
  id: string;
  date: string;
  sampleKind?: 'daily' | 'sample';
  connectionsCount?: number;
  followersCount?: number;
  searchAppearancesCount?: number;
  socialSellingIndexScore?: number;
  acceptanceRate?: number;
  profileViewsCount?: number;
  updatedAt: number;
}
