export interface ProfileViewersSyncResult {
  savedCount: number;
  newCount: number;
  searchSavedCount?: number;
  newSearchCount?: number;
  visibleCount: number;
  visibleSearchCount?: number;
  privateViewerCount?: number;
  updatedCount: number;
  visibleProfileUsernames: string[];
  newProfileUsernames: string[];
  httpStatus?: number;
  responseLength?: number;
  requestCount?: number;
  pagesFetched?: number;
  paginationComplete?: boolean;
  paginationMode?: 'backfill' | 'incremental';
}
