import type { AppPlan } from './plans';

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
  /** True only when the total came from the initial authoritative Connections RSC response. */
  connectionsCountExact?: boolean;
  connectionsCountUpdatedAt?: number;
  connectionsCountSource?: 'connections_rsc' | 'legacy' | 'network_info';
  /** Number of connections added on each LinkedIn connection date (YYYY-MM-DD). */
  connectionDateCounts?: Record<string, number>;
  /** True only after every connection page was read successfully. */
  connectionDateCountsComplete?: boolean;
  /** Connections for which LinkedIn exposed both a stable identity and a usable connection date. */
  connectionHistoryDatedCount?: number;
  /** Connections included in the exact total but without a usable date in LinkedIn's history response. */
  connectionHistoryUndatedCount?: number;
  connectionDateCountsUpdatedAt?: number;
  connectionDateCountsError?: string;
  /** LinkedIn can only backfill connections that still exist when history is collected. */
  connectionHistoryKind?: 'backfilled_current_connections';
  /**
   * Server-persisted lifecycle of the one-time Connections history bootstrap.
   * Current totals are usable while this is running; range analytics are not.
   */
  connectionHistoryBootstrap?: ProfileAnalyticsConnectionHistoryBootstrap;
  /** Exact Connections total captured when the one-time history baseline completed. */
  connectionHistoryBaselineCount?: number;
  connectionHistoryBaselineAt?: number;
  connectionHistoryAccountKey?: string;
  /** A light sync can request a bounded incremental catch-up without invalidating the baseline. */
  connectionIncrementalStatus?: 'idle' | 'current' | 'catch_up_pending';
  connectionIncrementalLastGapAt?: number;
  /** Recent identifiers used to stop incremental pagination at known data. */
  recentConnectionIds?: string[];
  followersCount?: number;
  /** True when the total came from LinkedIn Audience Analytics or an equivalent exact response. */
  followersCountExact?: boolean;
  /** LinkedIn's daily new-follower counts for the rolling 365-day window. */
  followerGrowthByDate?: Record<string, number>;
  followerGrowthStartDate?: string;
  followerGrowthEndDate?: string;
  followerGrowthUpdatedAt?: number;
  updatedAt: number;
  sourceUrl: string;
}

export type ProfileAnalyticsConnectionHistoryBootstrapState = 'scheduled' | 'running' | 'complete' | 'needs_repair';

export interface ProfileAnalyticsConnectionHistoryBootstrap {
  version: 2;
  accountKey: string;
  status: ProfileAnalyticsConnectionHistoryBootstrapState;
  sessionId?: string;
  expectedTotal?: number;
  collectedCount?: number;
  datedCount?: number;
  undatedCount?: number;
  nextStartIndex?: number;
  startedAt?: number;
  completedAt?: number;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  mode?: 'aggressive' | 'cautious';
  batchesSinceCooldown?: number;
  error?: string;
}

export interface ProfileAnalyticsConnectionHistoryJob extends ProfileAnalyticsConnectionHistoryBootstrap {
  id: string;
  restartCount: number;
  batchIndex: number;
  updatedAt: number;
}

export interface ProfileAnalyticsConnectionHistoryChunk {
  id: string;
  accountKey: string;
  sessionId: string;
  batchIndex: number;
  startIndex: number;
  records: Array<{ id: string; connectedDate: string }>;
  createdAt: number;
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
  /** Shared with the Content Analytics snapshot published in the same run. */
  syncRunId?: string;
  capturedAt?: number;
  publishedAt?: number;
  updatedAt: number;
}

export interface ProfileAnalyticsDailySnapshot {
  id: string;
  date: string;
  sampleKind?: 'daily' | 'sample';
  connectionsCount?: number;
  connectionsCountExact?: boolean;
  connectionsCountSource?: 'connections_rsc' | 'legacy' | 'network_info';
  /** Connections whose LinkedIn "Connected on" date matches this day. */
  connectionsAdded?: number;
  /** True for dates reconstructed from the current LinkedIn connections list. */
  connectionsAddedEstimated?: boolean;
  followersCount?: number;
  followersCountExact?: boolean;
  searchAppearancesCount?: number;
  socialSellingIndexScore?: number;
  acceptanceRate?: number;
  profileViewsCount?: number;
  profileViewsVisibleCount?: number;
  profileViewsPrivateCount?: number;
  profileViewsRecruiterCount?: number;
  updatedAt: number;
}

export type ProfileAnalyticsSyncMetric =
  | 'profileMetadata'
  | 'connections'
  | 'followers'
  | 'acceptanceRate'
  | 'searchAppearances'
  | 'socialSellingIndex';

export type ProfileAnalyticsSyncMetricState = 'idle' | 'syncing' | 'success' | 'failed' | 'blocked';

export interface ProfileAnalyticsSyncMetricStatus {
  status: ProfileAnalyticsSyncMetricState;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  nextRetryAt?: number;
  errorCode?: string;
  message?: string;
  technicalMessage?: string;
  sourceUrl?: string;
}

export interface ProfileAnalyticsSyncStatus {
  status: 'idle' | 'syncing' | 'success' | 'partial' | 'failed' | 'blocked';
  trigger?: string;
  startedAt?: number;
  finishedAt?: number;
  nextScheduledAt?: number;
  metrics: Partial<Record<ProfileAnalyticsSyncMetric, ProfileAnalyticsSyncMetricStatus>>;
}

/** Metrics rendered by the Content Analytics cards and chart tabs. */
export type ContentAnalyticsMetric =
  | 'posts'
  | 'impressions'
  | 'engagementRate'
  | 'reactions'
  | 'comments'
  | 'reposts';

/**
 * Every value LinkedIn can report for a range, a day, or a single post.
 * `linkedInEngagements` is LinkedIn's own aggregate and is deliberately kept
 * apart from our Engagement Rate numerator.
 */
export interface ContentAnalyticsMetricValues {
  posts?: number;
  impressions?: number;
  linkedInEngagements?: number;
  reactions?: number;
  comments?: number;
  reposts?: number;
  saves?: number;
  sends?: number;
  membersReached?: number;
  inNetworkImpressions?: number;
  outOfNetworkImpressions?: number;
  profileViewersFromPost?: number;
  followersGained?: number;
  /** Percentage in 0-100. `null` marks a known-but-undefined rate (no impressions). */
  engagementRate?: number | null;
}

/** How trustworthy a single metric is inside a snapshot. */
export type ContentAnalyticsCoverage = 'exact' | 'derived' | 'partial' | 'unavailable';

export type ContentAnalyticsMetricCoverage = Partial<
  Record<keyof ContentAnalyticsMetricValues, ContentAnalyticsCoverage>
>;

export type ContentAnalyticsRangeKey = '30d' | '90d' | '6m' | '1y' | 'custom';

export interface ContentAnalyticsRangeSnapshot {
  id: string;
  rangeKey: ContentAnalyticsRangeKey;
  /** Inclusive UTC day, `YYYY-MM-DD`. */
  startDate: string;
  /** Inclusive UTC day, `YYYY-MM-DD`. */
  endDate: string;
  timezone: 'UTC';
  metrics: ContentAnalyticsMetricValues;
  coverage: ContentAnalyticsMetricCoverage;
  syncRunId: string;
  capturedAt: number;
  publishedAt: number;
  sourceUrl: string;
  /** LinkedIn's own range token, kept for diagnostics and re-requests. */
  linkedInRange?: string;
}

export interface ContentAnalyticsDailySnapshot {
  id: string;
  /** UTC day, `YYYY-MM-DD`. */
  date: string;
  metrics: ContentAnalyticsMetricValues;
  coverage: ContentAnalyticsMetricCoverage;
  syncRunId: string;
  capturedAt: number;
}

export interface ContentAnalyticsPost {
  id: string;
  activityUrn: string;
  shareUrn?: string;
  text: string;
  linkedinUrl: string;
  analyticsUrl?: string;
  publishedAt: number;
  publishedAtSource: 'linkedin_timestamp' | 'activity_urn';
  /** Metrics scoped to the collected LinkedIn range. */
  rangeMetrics?: ContentAnalyticsMetricValues;
  /** Lifetime metrics from the post-summary page. Never mixed with `rangeMetrics`. */
  currentPostMetrics?: ContentAnalyticsMetricValues;
  rangeStart?: string;
  rangeEnd?: string;
  rangeKey?: ContentAnalyticsRangeKey;
  syncRunId: string;
  capturedAt: number;
  /** Set when the bounded post-summary enrichment last refreshed this post. */
  enrichedAt?: number;
  source: 'top_posts' | 'top_posts+post_summary';
}

/** Current Content Analytics document rendered by the dashboard first paint. */
export interface ContentAnalyticsSnapshot {
  defaultRangeKey: ContentAnalyticsRangeKey;
  range?: ContentAnalyticsRangeSnapshot;
  postsCount?: number;
  syncRunId: string;
  capturedAt: number;
  publishedAt: number;
  updatedAt: number;
  sourceUrl?: string;
}

export type DashboardAnalyticsSourceState =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'partial'
  | 'failed'
  | 'blocked'
  | 'skipped';

export interface DashboardAnalyticsSourceStatus {
  status: DashboardAnalyticsSourceState;
  capturedAt?: number;
  lastSuccessAt?: number;
  nextRetryAt?: number;
  /** Stable machine code. Never contains cookies, tokens, or response bodies. */
  errorCode?: string;
  message?: string;
}

export type DashboardAnalyticsRunState = 'syncing' | 'success' | 'partial' | 'failed' | 'blocked';

export interface DashboardAnalyticsSyncManifest {
  syncRunId: string;
  status: DashboardAnalyticsRunState;
  trigger: string;
  startedAt: number;
  finishedAt?: number;
  publishedAt?: number;
  profile: DashboardAnalyticsSourceStatus;
  content: DashboardAnalyticsSourceStatus;
  postEnrichment?: DashboardAnalyticsSourceStatus;
  connectionHistory?: DashboardAnalyticsSourceStatus;
}

/** Extension-local progress polled by the dashboard between Firestore publishes. */
export interface DashboardAnalyticsSyncStatus extends ProfileAnalyticsSyncStatus {
  content?: DashboardAnalyticsSourceStatus;
}
