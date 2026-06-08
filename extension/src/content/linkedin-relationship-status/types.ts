export type RelationshipStatus = 'connected' | 'pending' | 'connect' | 'following' | 'withdrawn' | 'unavailable';

export type RelationshipResolution = {
  status: RelationshipStatus;
  profileUrn?: string;
  canMessage?: boolean;
  canFollow?: boolean;
  canConnect?: boolean;
  isFollowing?: boolean;
  memberNumericId?: string;
  isPremium?: boolean;
  profileImageUrl?: string;
};

export type CachedStatus = {
  status: RelationshipStatus;
  profileUrn?: string;
  canMessage?: boolean;
  canFollow?: boolean;
  canConnect?: boolean;
  isFollowing?: boolean;
  memberNumericId?: string;
  isPremium?: boolean;
  profileImageUrl?: string;
  fetchedAt: number;
};
