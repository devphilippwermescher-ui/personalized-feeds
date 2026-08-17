import type { User } from 'firebase/auth';
import { updateProfileViewerSummary } from 'shared/firestore-service';
import { ProfileViewersSyncError } from './profile-viewers-error';
import { fetchProfileViewersPaginationPage, getLinkedInCsrfToken } from './profile-viewers-api-client';
import { PROFILE_VIEWERS_PAGINATION_PAGE_SIZE } from './profile-viewers-pagination';
import { waitForProfileViewersPaginationPace } from './profile-viewers-request-pacing';
import type { ProfileViewersSyncResult } from './profile-viewers-sync-result';
import {
  canMakeProfileViewersRequest,
  recordProfileViewersRequest,
  type ProfileViewersSyncState,
} from './profile-viewers-sync-state';

function createPrivateSummaryResult(
  page: Awaited<ReturnType<typeof fetchProfileViewersPaginationPage>>,
  stats: {
    pagesFetched: number;
    responseLength: number;
    recruiterViewerCount?: number;
    recruiterViewerUrl?: string;
  },
  privateViewerCount?: number,
  privateViewerCountStart?: number
): ProfileViewersSyncResult {
  return {
    savedCount: 0,
    newCount: 0,
    searchSavedCount: 0,
    newSearchCount: 0,
    visibleCount: 0,
    visibleSearchCount: 0,
    privateViewerCount,
    recruiterViewerCount: stats.recruiterViewerCount,
    recruiterViewerUrl: stats.recruiterViewerUrl,
    updatedCount: 0,
    visibleProfileUsernames: [],
    newProfileUsernames: [],
    httpStatus: page.httpStatus,
    responseLength: stats.responseLength,
    requestCount: stats.pagesFetched,
    pagesFetched: stats.pagesFetched,
    paginationComplete: privateViewerCount !== undefined,
    collectionTask: 'private_summary',
    privateViewerCountStart,
  };
}

export async function syncPrivateProfileViewerSummaryViaApi(
  authenticatedUser: User | undefined,
  initialSyncState: ProfileViewersSyncState,
  persistSyncProgress: (state: ProfileViewersSyncState) => Promise<void>,
  requestBudgetReserve = 0
): Promise<ProfileViewersSyncResult> {
  const user = authenticatedUser;
  if (!user) {
    throw new ProfileViewersSyncError(
      'myFeedPilot authentication is required before private profile visitors can be saved.',
      'app_auth_required'
    );
  }

  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new ProfileViewersSyncError(
      'LinkedIn CSRF token is unavailable. Make sure you are signed in to LinkedIn.',
      'linkedin_auth_required'
    );
  }

  // A successful known position is authoritative. Older builds could leave a
  // stale full-scan checkpoint beside it after a visible sync; do not let that
  // stale cursor force another complete pagination walk.
  const usingKnownPosition = typeof initialSyncState.privateSummaryKnownStart === 'number';
  const usingScanCheckpoint =
    !usingKnownPosition && typeof initialSyncState.privateSummaryNextStart === 'number';
  let scanOrigin = usingScanCheckpoint
    ? initialSyncState.privateSummaryScanOrigin || 'full'
    : usingKnownPosition
      ? 'known_position'
      : 'full';
  let cursor = {
    start: usingScanCheckpoint
      ? initialSyncState.privateSummaryNextStart!
      : usingKnownPosition
        ? initialSyncState.privateSummaryKnownStart!
        : PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
    count: initialSyncState.privateSummaryPageSize || PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
  };
  let state = initialSyncState;
  let pagesFetched = 0;
  let responseLength = 0;
  let recruiterViewerCount: number | undefined;
  let recruiterViewerUrl: string | undefined;

  while (true) {
    const page = await fetchProfileViewersPaginationPage(cursor, csrfToken);
    const attemptedAt = Date.now();
    pagesFetched += 1;
    responseLength += page.responseLength;
    if (page.recruiterViewerCount !== null) {
      recruiterViewerCount = page.recruiterViewerCount;
    }
    if (page.recruiterViewerUrl) {
      recruiterViewerUrl = page.recruiterViewerUrl;
    }
    const stats = {
      pagesFetched,
      responseLength,
      recruiterViewerCount,
      recruiterViewerUrl,
    };

    if (page.privateViewerCount !== null) {
      await updateProfileViewerSummary(
        user.uid,
        {
          privateViewerCount: page.privateViewerCount,
          recruiterViewerCount,
          recruiterViewerUrl,
        },
        attemptedAt
      );
      state = {
        ...state,
        nextCollectionTask: 'visible',
        privateSummaryStatus: 'ready',
        privateSummaryNextStart: undefined,
        privateSummaryPageSize: cursor.count,
        privateSummaryKnownStart: cursor.start,
        privateSummaryScanOrigin: undefined,
        privateSummaryLastAttemptAt: attemptedAt,
        privateSummaryLastSuccessAt: attemptedAt,
        updatedAt: attemptedAt,
      };
      await persistSyncProgress(state);
      return createPrivateSummaryResult(page, stats, page.privateViewerCount, cursor.start);
    }

    const nextCursor = page.nextCursor;
    if (nextCursor) {
      if (nextCursor.start <= cursor.start) {
        throw new ProfileViewersSyncError(
          `LinkedIn private profile viewer pagination did not advance past ${cursor.start}.`,
          'parse_error',
          page.httpStatus
        );
      }
      state = {
        ...state,
        nextCollectionTask: 'private_summary',
        privateSummaryStatus: 'scanning',
        privateSummaryNextStart: nextCursor.start,
        privateSummaryPageSize: nextCursor.count,
        privateSummaryScanOrigin: scanOrigin,
        privateSummaryLastAttemptAt: attemptedAt,
        updatedAt: attemptedAt,
      };
      await persistSyncProgress(state);
      if (
        !canMakeProfileViewersRequest(
          state,
          Date.now(),
          requestBudgetReserve
        )
      ) {
        return createPrivateSummaryResult(page, stats);
      }
      state = recordProfileViewersRequest(state, Date.now());
      await persistSyncProgress(state);
      cursor = nextCursor;
      await waitForProfileViewersPaginationPace();
      continue;
    }

    if (scanOrigin === 'known_position') {
      scanOrigin = 'full';
      cursor = {
        start: PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
        count: PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
      };
      state = {
        ...state,
        nextCollectionTask: 'private_summary',
        privateSummaryStatus: 'scanning',
        privateSummaryNextStart: cursor.start,
        privateSummaryPageSize: cursor.count,
        privateSummaryKnownStart: undefined,
        privateSummaryScanOrigin: 'full',
        privateSummaryLastAttemptAt: attemptedAt,
        updatedAt: attemptedAt,
      };
      await persistSyncProgress(state);
      if (
        !canMakeProfileViewersRequest(
          state,
          Date.now(),
          requestBudgetReserve
        )
      ) {
        return createPrivateSummaryResult(page, stats);
      }
      state = recordProfileViewersRequest(state, Date.now());
      await persistSyncProgress(state);
      await waitForProfileViewersPaginationPace();
      continue;
    }

    await updateProfileViewerSummary(
      user.uid,
      {
        privateViewerCount: 0,
        recruiterViewerCount,
        recruiterViewerUrl,
      },
      attemptedAt
    );
    state = {
      ...state,
      nextCollectionTask: 'visible',
      privateSummaryStatus: 'ready',
      privateSummaryNextStart: undefined,
      privateSummaryKnownStart: undefined,
      privateSummaryScanOrigin: undefined,
      privateSummaryLastAttemptAt: attemptedAt,
      privateSummaryLastSuccessAt: attemptedAt,
      updatedAt: attemptedAt,
    };
    await persistSyncProgress(state);
    return createPrivateSummaryResult(page, stats, 0);
  }
}
