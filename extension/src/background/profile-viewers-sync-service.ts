import type { User } from 'firebase/auth';
import {
  getProfileViewerSearches,
  getProfileViewers,
  updateProfileViewerSummary,
  upsertProfileViewerSearches,
  upsertProfileViewers,
} from 'shared/firestore-service';
import type { ProfileViewerInput, ProfileViewerSearchInput } from 'shared/types';
import { mergeProfileViewerCandidates } from './profile-viewers-parser-merge';
import {
  createRecentProfileViewerSnapshot,
  extendBackfillRecentProfileViewerSnapshot,
  PROFILE_VIEWERS_MAX_PAGES_PER_SYNC,
  shouldStopIncrementalProfileViewerPagination,
  type ProfileViewersPaginationCursor,
} from './profile-viewers-pagination';
import {
  canMakeProfileViewersRequest,
  recordProfileViewersRequest,
  type ProfileViewersSyncState,
} from './profile-viewers-sync-state';
import {
  fetchProfileViewersFromRsc,
  fetchProfileViewersPaginationPage,
  getLinkedInCsrfToken,
} from './profile-viewers-api-client';
import { ProfileViewersSyncError } from './profile-viewers-error';
import {
  enrichVisibleProfileViewers,
  updateExistingProfileViewerSnapshot,
} from './profile-viewers-enrichment-service';
import type { ProfileViewersSyncResult } from './profile-viewers-sync-result';

export async function syncProfileViewersViaApi(
  authenticatedUser: User | undefined,
  initialSyncState: ProfileViewersSyncState,
  persistSyncProgress: (state: ProfileViewersSyncState) => Promise<void>
): Promise<ProfileViewersSyncResult> {
  const user = authenticatedUser;
  if (!user) {
    throw new ProfileViewersSyncError(
      'myFeedPilot authentication is required before profile visitors can be saved.',
      'app_auth_required'
    );
  }

  const [existingViewers, existingSearches] = await Promise.all([
    getProfileViewers(user.uid),
    getProfileViewerSearches(user.uid),
  ]);
  const existingByUsername = new Map(
    existingViewers.map((viewer) => [viewer.linkedinUsername.toLowerCase(), viewer])
  );
  const existingSearchesByKey = new Map(
    existingSearches.map((search) => [search.searchKey, search])
  );
  const existingUsernames = new Set(existingByUsername.keys());
  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new ProfileViewersSyncError(
      'LinkedIn CSRF token is unavailable. Make sure you are signed in to LinkedIn.',
      'linkedin_auth_required'
    );
  }

  let syncState = initialSyncState;
  const paginationMode = syncState.backfillStatus === 'complete' ? 'incremental' : 'backfill';
  const syncSeenAt =
    paginationMode === 'backfill'
      ? syncState.backfillStartedAt || Date.now()
      : Date.now();
  const collectedViewers: ProfileViewerInput[] = [];
  const collectedSearches = new Map<string, ProfileViewerSearchInput>();
  const newProfileUsernames: string[] = [];
  const visitedCursors = new Set<number>();
  let requestCount = 0;
  let pagesFetched = 0;
  let savedCount = 0;
  let newCount = 0;
  let searchSavedCount = 0;
  let newSearchCount = 0;
  let privateViewerCount: number | undefined;
  let responseLength = 0;
  let httpStatus = 200;
  let cursor: ProfileViewersPaginationCursor | null =
    paginationMode === 'backfill' &&
    syncState.backfillStatus === 'in_progress' &&
    typeof syncState.backfillNextStart === 'number'
      ? {
          start: syncState.backfillNextStart,
          count: syncState.backfillPageSize || 10,
        }
      : null;
  let page =
    cursor === null
      ? await fetchProfileViewersFromRsc(csrfToken)
      : await fetchProfileViewersPaginationPage(cursor, csrfToken);
  let positionOffset = cursor?.start || 0;
  if (cursor) {
    visitedCursors.add(cursor.start);
  }
  let consecutivePagesWithoutNewProfiles = 0;
  let paginationComplete = false;

  while (true) {
    requestCount += 1;
    pagesFetched += 1;
    responseLength += page.responseLength;
    httpStatus = page.httpStatus;

    const existingSnapshot = Array.from(existingByUsername.values());
    const enrichment = await enrichVisibleProfileViewers(page.viewers, existingSnapshot);
    const pageViewers = enrichment.viewers;
    const pageHasNewProfiles = pageViewers.some(
      (viewer) => !existingUsernames.has(viewer.linkedinUsername.toLowerCase())
    );
    consecutivePagesWithoutNewProfiles = pageHasNewProfiles
      ? 0
      : consecutivePagesWithoutNewProfiles + 1;

    const writeResult = await upsertProfileViewers(
      user.uid,
      pageViewers,
      existingSnapshot,
      {
        seenAt: syncSeenAt,
        positionOffset,
      }
    );
    savedCount += writeResult.savedCount;
    newCount += writeResult.newCount;
    newProfileUsernames.push(...writeResult.newProfileUsernames);
    const searchWriteResult = await upsertProfileViewerSearches(
      user.uid,
      page.searches,
      Array.from(existingSearchesByKey.values()),
      {
        seenAt: syncSeenAt,
        positionOffset,
      }
    );
    searchSavedCount += searchWriteResult.savedCount;
    newSearchCount += searchWriteResult.newCount;
    if (page.privateViewerCount !== null) {
      privateViewerCount = page.privateViewerCount;
    }
    page.searches.forEach((search) => {
      const existing = existingSearchesByKey.get(search.searchKey);
      existingSearchesByKey.set(search.searchKey, {
        id: encodeURIComponent(search.searchKey),
        itemType: 'search',
        searchKey: search.searchKey,
        searchUrl: search.searchUrl,
        displayName: search.displayName,
        keywords: search.keywords,
        currentCompany: search.currentCompany,
        viewedAgoText: search.viewedAgoText,
        firstSeenAt: existing?.firstSeenAt || syncSeenAt,
        lastSeenAt: syncSeenAt,
        lastSeenPosition:
          positionOffset + (search.listPosition ?? collectedSearches.size),
        source: 'linkedin_profile_views',
      });
      collectedSearches.set(search.searchKey, search);
    });
    updateExistingProfileViewerSnapshot(
      existingByUsername,
      pageViewers,
      syncSeenAt,
      positionOffset
    );
    collectedViewers.splice(
      0,
      collectedViewers.length,
      ...mergeProfileViewerCandidates([collectedViewers, pageViewers])
    );

    const nextCursor = page.nextCursor;
    if (paginationMode === 'backfill') {
      const completedBackfill = !nextCursor;
      syncState = {
        ...syncState,
        backfillStatus: completedBackfill ? 'complete' : 'in_progress',
        backfillNextStart: nextCursor?.start,
        backfillPageSize: nextCursor?.count,
        backfillStartedAt: syncState.backfillStartedAt || syncSeenAt,
        backfillCompletedAt: completedBackfill ? Date.now() : undefined,
        backfillPagesFetched: syncState.backfillPagesFetched + 1,
        backfillProfilesSaved: syncState.backfillProfilesSaved + writeResult.savedCount,
        recentProfileViewerUsernames: extendBackfillRecentProfileViewerSnapshot(
          syncState.recentProfileViewerUsernames,
          pageViewers.map((viewer) => viewer.linkedinUsername),
          positionOffset
        ),
        updatedAt: Date.now(),
      };
      await persistSyncProgress(syncState);
    }

    if (!nextCursor) {
      paginationComplete = true;
      break;
    }

    if (
      paginationMode === 'incremental' &&
      shouldStopIncrementalProfileViewerPagination(
        collectedViewers,
        pageViewers,
        existingUsernames,
        syncState.recentProfileViewerUsernames,
        consecutivePagesWithoutNewProfiles
      )
    ) {
      paginationComplete = true;
      break;
    }

    if (pagesFetched >= PROFILE_VIEWERS_MAX_PAGES_PER_SYNC) {
      break;
    }

    if (visitedCursors.has(nextCursor.start)) {
      throw new ProfileViewersSyncError(
        `LinkedIn profile viewers pagination repeated cursor ${nextCursor.start}.`,
        'parse_error',
        page.httpStatus
      );
    }
    visitedCursors.add(nextCursor.start);

    if (!canMakeProfileViewersRequest(syncState, Date.now())) {
      break;
    }

    syncState = recordProfileViewersRequest(syncState, Date.now());
    if (paginationMode === 'backfill') {
      syncState = {
        ...syncState,
        backfillStatus: 'in_progress',
        backfillNextStart: nextCursor.start,
        backfillPageSize: nextCursor.count,
      };
    }
    await persistSyncProgress(syncState);

    cursor = nextCursor;
    positionOffset = cursor.start;
    page = await fetchProfileViewersPaginationPage(cursor, csrfToken);
  }

  if (privateViewerCount !== undefined) {
    await updateProfileViewerSummary(user.uid, privateViewerCount, syncSeenAt);
  }

  if (paginationMode === 'incremental') {
    syncState = {
      ...syncState,
      recentProfileViewerUsernames: createRecentProfileViewerSnapshot(
        collectedViewers.map((viewer) => viewer.linkedinUsername),
        syncState.recentProfileViewerUsernames
      ),
      updatedAt: Date.now(),
    };
    await persistSyncProgress(syncState);
  }

  console.info('[profile-viewers-sync] pagination', {
    mode: paginationMode,
    pagesFetched,
    requestCount,
    profilesCollected: collectedViewers.length,
    searchesCollected: collectedSearches.size,
    privateViewerCount,
    paginationComplete,
    backfillStatus: syncState.backfillStatus,
    backfillNextStart: syncState.backfillNextStart,
  });

  return {
    savedCount,
    newCount,
    searchSavedCount,
    newSearchCount,
    newProfileUsernames,
    visibleCount: collectedViewers.length,
    visibleSearchCount: collectedSearches.size,
    privateViewerCount,
    updatedCount: savedCount - newCount,
    visibleProfileUsernames: collectedViewers.map((viewer) => viewer.linkedinUsername),
    httpStatus,
    responseLength,
    requestCount,
    pagesFetched,
    paginationComplete,
    paginationMode,
  };
}
