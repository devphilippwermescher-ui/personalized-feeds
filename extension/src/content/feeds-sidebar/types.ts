export interface UserInfo {
  userId: string;
  displayName: string;
  email: string;
  photoURL: string;
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
  ownerDisplayName?: string;
  ownerEmail?: string;
  ownerPhotoURL?: string;
  followedAt?: number;
}

export interface FeedMemberInfo {
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
  status?: 'connected' | 'pending' | 'connect' | 'following' | 'withdrawn' | 'unavailable' | 'loading';
  transientAction?: 'connect' | 'follow';
  addedAt: number;
}

export interface MemberEditorState {
  feedId: string;
  feedName: string;
  member: FeedMemberInfo;
}
