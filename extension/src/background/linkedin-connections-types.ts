export interface LinkedInConnectionsRscPage {
  connectionsCount?: number;
  connectionDateCounts: Record<string, number>;
  nextStartIndex?: number;
  connectionIds?: string[];
}

export interface LinkedInConnectionsSnapshot {
  connectionsCount?: number;
  connectionDateCounts: Record<string, number>;
  /** True only when every connection represented by the exact total was read. */
  connectionDateCountsComplete: boolean;
  /** Most-recent stable profile identifiers, used to stop later incremental pagination. */
  recentConnectionIds?: string[];
  error?: string;
}
