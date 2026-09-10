export interface LinkedInConnectionRecord {
  id: string;
  connectedDate: string;
}

export interface LinkedInConnectionsRscPage {
  connectionsCount?: number;
  connectionDateCounts: Record<string, number>;
  nextStartIndex?: number;
  connectionIds?: string[];
  connectionRecords?: LinkedInConnectionRecord[];
}

export interface LinkedInConnectionsSnapshot {
  connectionsCount?: number;
  /** Set only when `connectionsCount` came from the initial Connections RSC page. */
  connectionsCountExact?: boolean;
  connectionDateCounts: Record<string, number>;
  /** True only when every connection represented by the exact total was parsed with a usable date. */
  connectionDateCountsComplete: boolean;
  /** Most-recent stable profile identifiers, used to stop later incremental pagination. */
  recentConnectionIds?: string[];
  /** Records not previously seen before an incremental known-id boundary. */
  newConnectionDateCounts?: Record<string, number>;
  boundaryFound?: boolean;
  nextStartIndex?: number;
  paginationComplete?: boolean;
  pagesFetched?: number;
  connectionRecords?: LinkedInConnectionRecord[];
  error?: string;
}
