import type { AppPlan } from '../plans';

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
  /** Plan active when this document was first collected. Missing means legacy/grandfathered data. */
  collectedPlan?: AppPlan;
}

export type ProfileViewerInput = Omit<
  ProfileViewer,
  'id' | 'firstSeenAt' | 'lastSeenAt' | 'lastSeenPosition' | 'source'
> & {
  sourceIndex?: number;
  /** Parser-only LinkedIn card position. It is intentionally not persisted to Firestore. */
  renderPosition?: number;
  listPosition?: number;
  /** Parser-only signal. It is intentionally not persisted to Firestore. */
  identityUncertain?: boolean;
  /** Enrichment-only signal. It prevents preserving an image attached to a conflicting stored identity. */
  discardExistingProfileImage?: boolean;
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
