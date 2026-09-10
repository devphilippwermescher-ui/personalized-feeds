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
