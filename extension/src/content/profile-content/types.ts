export interface ProfileData {
  linkedinUrl: string;
  linkedinUsername: string;
  profileUrn?: string;
  memberNumericId?: string;
  displayName: string;
  headline?: string;
  profileImageUrl?: string;
  company?: string;
  location?: string;
  connectionDegree?: string;
  memberId?: string;
  canMessage?: boolean;
  canFollow?: boolean;
  canConnect?: boolean;
  isFollowing?: boolean;
}

export interface FeedInfo {
  id: string;
  name: string;
  color?: string;
  memberCount: number;
}

export interface FeedMembership {
  feedId: string;
  feedName: string;
  memberId: string;
}

export interface RelationshipState {
  status?: 'connected' | 'pending' | 'connect' | 'following';
  connectionDegree?: string;
  canMessage?: boolean;
  canFollow?: boolean;
  canConnect?: boolean;
  isFollowing?: boolean;
  isPremium?: boolean;
}
