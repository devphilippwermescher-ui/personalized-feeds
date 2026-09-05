import type { ProfileViewersCollectionProgress } from '../../shared/profile-viewers-progress';
import type { BillingCurrency } from 'shared/types';

export interface UserInfo {
  userId: string;
  displayName: string;
  email: string;
  photoURL: string;
  authDisplayName?: string;
  authPhotoURL?: string;
  billingCurrency?: BillingCurrency;
}

export interface FeedInfo {
  id: string;
  name: string;
  description?: string;
  color: string;
  memberCount: number;
  sortOrder?: number;
  ownerId?: string;
  isShared?: boolean;
  accessRole?: 'reader' | 'editor';
  previousAccessRole?: 'reader' | 'editor';
  ownerDisplayName?: string;
  ownerEmail?: string;
  ownerPhotoURL?: string;
  followedAt?: number;
  followedFeedId?: string;
  followedSortOrder?: number;
  isSystem?: boolean;
  systemType?: 'profileViewers';
  privateViewerCount?: number;
  recruiterViewerCount?: number;
  profileViewersCollectionProgress?: ProfileViewersCollectionProgress;
  isRefreshingProfileViewers?: boolean;
  isConfirmingProfileViewersRefresh?: boolean;
}

export interface FeedMemberInfo {
  id: string;
  linkedinUrl: string;
  linkedinUsername: string;
  itemType?: 'profile' | 'search' | 'recruiterAggregate';
  searchKey?: string;
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
  viewedAgoText?: string;
  mutualConnectionsText?: string;
  firstSeenAt?: number;
  lastSeenAt?: number;
  statusResolvedAt?: number;
  status?: 'connected' | 'pending' | 'connect' | 'following' | 'withdrawn' | 'unavailable' | 'loading';
  transientAction?: 'connect' | 'follow';
  addedAt: number;
}

export interface MemberEditorState {
  feedId: string;
  feedName: string;
  member: FeedMemberInfo;
}
