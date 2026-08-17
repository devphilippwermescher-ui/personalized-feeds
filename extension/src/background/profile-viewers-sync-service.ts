import type { User } from 'firebase/auth';
import {
  deleteStaleProfileViewerCache,
  getProfileViewers,
  updateProfileViewerSummary,
  upsertProfileViewers,
} from 'shared/firestore-service';
import type { ProfileViewerInput } from 'shared/types';
import { mergeProfileViewerCandidates } from './profile-viewers-parser-merge';
import {
  createRecentProfileViewerSnapshot,
  extendBackfillRecentProfileViewerSnapshot,
  PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
  shouldStopIncrementalProfileViewerPagination,
  type ProfileViewersPaginationCursor,
} from './profile-viewers-pagination';
import {
  canMakeProfileViewersRequest,
  recordProfileViewersRequest,
  scheduleProfileViewersPrivateSummaryCollection,
  type ProfileViewersSyncState,
} from './profile-viewers-sync-state';
import {
  fetchProfileViewersFromRsc,
  fetchProfileViewersPaginationPage,
  getLinkedInCsrfToken,
} from './profile-viewers-api-client';
import { ProfileViewersSyncError } from './profile-viewers-error';
import { waitForProfileViewersPaginationPace } from './profile-viewers-request-pacing';
import { enrichVisibleProfileViewers, updateExistingProfileViewerSnapshot } from './profile-viewers-enrichment-service';
import type { ProfileViewersSyncResult } from './profile-viewers-sync-result';
import { repairStoredProfileViewerIdentityMismatches } from './profile-viewers-stored-identity-repair';

export async function syncProfileViewersViaApi(
  authenticatedUser: User | undefined,
  initialSyncState: ProfileViewersSyncState,
  persistSyncProgress: (state: ProfileViewersSyncState) => Promise<void>,
  options: {
    requestBudgetReserve?: number;
    pruneStaleAfterComplete?: boolean;
    repairStoredIdentityMismatches?: boolean;
  } = {}
): Promise<ProfileViewersSyncResult> {
  const user = authenticatedUser;
  if (!user) {
    throw new ProfileViewersSyncError(
      'myFeedPilot authentication is required before profile visitors can be saved.',
      'app_auth_required'
    );
  }

  const existingViewers = await getProfileViewers(user.uid);
  const existingByUsername = new Map(existingViewers.map((viewer) => [viewer.linkedinUsername.toLowerCase(), viewer]));
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
  const syncSeenAt = paginationMode === 'backfill' ? syncState.backfillStartedAt || Date.now() : Date.now();
  const collectedViewers: ProfileViewerInput[] = [];
  const newProfileUsernames: string[] = [];
  const visitedCursors = new Set<number>();
  let requestCount = 0;
  let pagesFetched = 0;
  let savedCount = 0;
  let newCount = 0;
  let privateViewerCount: number | undefined;
  let privateViewerCountStart: number | undefined;
  let recruiterViewerCount: number | undefined;
  let recruiterViewerUrl: string | undefined;
  let responseLength = 0;
  let httpStatus = 200;
  let hadUnresolvedIdentities = false;
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
  let reachedLinkedInEnd = false;
  let privateSummaryContinuationCursor: ProfileViewersPaginationCursor | null = null;

  while (true) {
    requestCount += 1;
    pagesFetched += 1;
    responseLength += page.responseLength;
    httpStatus = page.httpStatus;

    const untrustedRscIdentities = page.viewers
      .filter((viewer) => viewer.identityUncertain === true)
      .map((viewer) => ({
        linkedinUsername: viewer.linkedinUsername,
        linkedinUrl: viewer.linkedinUrl,
        parsedDisplayName: viewer.displayName,
      }));
    if (untrustedRscIdentities.length > 0) {
      console.warn('[profile-viewers-sync] untrusted identities parsed from WvmpEntityList', {
        identities: untrustedRscIdentities,
      });
    }

    const existingSnapshot = Array.from(existingByUsername.values());
    const enrichment = await enrichVisibleProfileViewers(page.viewers, existingSnapshot);
    const pageViewers = enrichment.viewers;
    const unresolvedIdentities = pageViewers
      .filter((viewer) => viewer.identityUncertain === true)
      .map((viewer) => ({
        linkedinUsername: viewer.linkedinUsername,
        linkedinUrl: viewer.linkedinUrl,
        unverifiedDisplayName: viewer.displayName,
      }));
    if (unresolvedIdentities.length > 0) {
      hadUnresolvedIdentities = true;
      console.warn('[profile-viewers-sync] identities still unresolved after exact-profile enrichment', {
        identities: unresolvedIdentities,
        action: 'Skipped Firestore identity update',
      });
    }
    const identityRepairs = enrichment.diagnostics.filter(
      (diagnostic) =>
        diagnostic.parsedDisplayName !== diagnostic.finalDisplayName ||
        diagnostic.ignoredDuplicateExistingImage ||
        diagnostic.removedAmbiguousFinalImage ||
        (diagnostic.hadExistingImage && !diagnostic.hadRscImage && !diagnostic.skippedEnrichment)
    );
    if (identityRepairs.length > 0) {
      console.info('[profile-viewers-sync] viewer identities revalidated', {
        repairs: identityRepairs,
      });
    }
    const pageHasNewProfiles = pageViewers.some(
      (viewer) => !existingUsernames.has(viewer.linkedinUsername.toLowerCase())
    );
    consecutivePagesWithoutNewProfiles = pageHasNewProfiles ? 0 : consecutivePagesWithoutNewProfiles + 1;

    const writeResult = await upsertProfileViewers(user.uid, pageViewers, existingSnapshot, {
      seenAt: syncSeenAt,
      positionOffset,
    });
    savedCount += writeResult.savedCount;
    newCount += writeResult.newCount;
    newProfileUsernames.push(...writeResult.newProfileUsernames);
    if (page.privateViewerCount !== null) {
      privateViewerCount = page.privateViewerCount;
      privateViewerCountStart = positionOffset;
    }
    if (page.recruiterViewerCount !== null) {
      recruiterViewerCount = page.recruiterViewerCount;
    }
    if (page.recruiterViewerUrl) {
      recruiterViewerUrl = page.recruiterViewerUrl;
    }
    updateExistingProfileViewerSnapshot(existingByUsername, pageViewers, syncSeenAt, positionOffset);
    collectedViewers.splice(
      0,
      collectedViewers.length,
      ...mergeProfileViewerCandidates([collectedViewers, pageViewers])
    );

    const nextCursor = page.nextCursor;
    privateSummaryContinuationCursor = nextCursor;
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
      reachedLinkedInEnd = true;
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

    if (visitedCursors.has(nextCursor.start)) {
      throw new ProfileViewersSyncError(
        `LinkedIn profile viewers pagination repeated cursor ${nextCursor.start}.`,
        'parse_error',
        page.httpStatus
      );
    }
    visitedCursors.add(nextCursor.start);

    if (
      !canMakeProfileViewersRequest(
        syncState,
        Date.now(),
        options.requestBudgetReserve || 0
      )
    ) {
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
    await waitForProfileViewersPaginationPace();
    page = await fetchProfileViewersPaginationPage(cursor, csrfToken);
  }

  const summaryUpdatedAt = Date.now();
  if (privateViewerCount !== undefined) {
    syncState = {
      ...syncState,
      nextCollectionTask: privateViewerCountStart === 0 ? 'visible' : 'private_summary',
      privateSummaryStatus: 'ready',
      privateSummaryNextStart: undefined,
      privateSummaryPageSize: PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
      privateSummaryKnownStart: privateViewerCountStart,
      privateSummaryScanOrigin: undefined,
      privateSummaryLastAttemptAt: summaryUpdatedAt,
      privateSummaryLastSuccessAt: summaryUpdatedAt,
      updatedAt: summaryUpdatedAt,
    };
    await persistSyncProgress(syncState);
  } else if (paginationMode === 'incremental' || (reachedLinkedInEnd && syncState.backfillStatus === 'complete')) {
    syncState = scheduleProfileViewersPrivateSummaryCollection(
      syncState,
      privateSummaryContinuationCursor,
      summaryUpdatedAt
    );
    await persistSyncProgress(syncState);
  }

  if (privateViewerCount !== undefined || recruiterViewerCount !== undefined || recruiterViewerUrl) {
    await updateProfileViewerSummary(
      user.uid,
      {
        privateViewerCount,
        recruiterViewerCount,
        recruiterViewerUrl,
      },
      syncSeenAt
    );
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

  if (options.pruneStaleAfterComplete && paginationComplete && !hadUnresolvedIdentities) {
    await deleteStaleProfileViewerCache(user.uid, syncSeenAt);
  }

  if (options.repairStoredIdentityMismatches) {
    const repairResults = await repairStoredProfileViewerIdentityMismatches(user.uid, existingViewers);
    if (repairResults.length > 0) {
      console.info('[profile-viewers-sync] stored identity repair completed', {
        results: repairResults,
      });
    }
  }

  return {
    savedCount,
    newCount,
    searchSavedCount: 0,
    newSearchCount: 0,
    newProfileUsernames,
    // existingByUsername starts with the complete persisted collection and is
    // updated after every page, so this is the exact stored visible total. It
    // avoids Firestore aggregation queries that are unavailable in MV3 workers.
    visibleCount: existingByUsername.size,
    visibleSearchCount: 0,
    privateViewerCount,
    recruiterViewerCount,
    recruiterViewerUrl,
    updatedCount: savedCount - newCount,
    visibleProfileUsernames: collectedViewers.map((viewer) => viewer.linkedinUsername),
    httpStatus,
    responseLength,
    requestCount,
    pagesFetched,
    paginationComplete,
    paginationMode,
    collectionTask: 'visible',
    privateViewerCountStart,
  };
}
