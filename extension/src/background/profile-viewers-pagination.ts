import type { ProfileViewerInput } from 'shared/types';

export const PROFILE_VIEWERS_PAGER_ID = 'com.linkedin.sdui.premium.wvmp.entityList';
export const PROFILE_VIEWERS_PAGINATION_PAGE_SIZE = 10;
export const PROFILE_VIEWERS_RECENT_SNAPSHOT_LIMIT = 50;
export const PROFILE_VIEWERS_STABLE_OVERLAP_SIZE = 5;

export interface ProfileViewersPaginationCursor {
  start: number;
  count: number;
}

const FILTER_TYPES = [
  'WvmpSearchFilterType_DATE_RANGE',
  'WvmpSearchFilterType_INTERESTING_VIEWER',
  'WvmpSearchFilterType_ORGANIZATION',
  'WvmpSearchFilterType_INDUSTRY',
  'WvmpSearchFilterType_LOCATION',
] as const;

const FILTER_STATE_KEYS = {
  WvmpSearchFilterType_DATE_RANGE: 'entityListQueryFilterPrefixWvmpSearchFilterType_DATE_RANGE',
  WvmpSearchFilterType_INTERESTING_VIEWER: 'entityListQueryFilterPrefixWvmpSearchFilterType_INTERESTING_VIEWER',
  WvmpSearchFilterType_ORGANIZATION: 'entityListQueryFilterPrefixWvmpSearchFilterType_ORGANIZATION',
  WvmpSearchFilterType_INDUSTRY: 'entityListQueryFilterPrefixWvmpSearchFilterType_INDUSTRY',
  WvmpSearchFilterType_LOCATION: 'entityListQueryFilterPrefixWvmpSearchFilterType_LOCATION',
} as const;

function createRequestedStateKeys() {
  return FILTER_TYPES.map((filterType) => ({
    key: {
      value: {
        $case: 'id',
        id: FILTER_STATE_KEYS[filterType],
      },
    },
  }));
}

function createFilterStates() {
  return FILTER_TYPES.map((filterType) => ({
    key: FILTER_STATE_KEYS[filterType],
    namespace: 'MemoryNamespace',
    value: filterType === 'WvmpSearchFilterType_DATE_RANGE' ? ['WvmpSearchFilterTimeRange_LAST_90_DAYS'] : [],
    originalProtoCase: 'stringListValue',
  }));
}

function createPaginationPayload(cursor: ProfileViewersPaginationCursor) {
  return {
    start: cursor.start,
    count: cursor.count,
    sortType: 'ProfileViewSortType_TIME_DESCENDING',
    filterTypeList: [...FILTER_TYPES],
    dateRangeSelectionFilters: {
      key: FILTER_STATE_KEYS.WvmpSearchFilterType_DATE_RANGE,
      namespace: 'MemoryNamespace',
    },
    interestingViewerSelectionFilters: {
      key: FILTER_STATE_KEYS.WvmpSearchFilterType_INTERESTING_VIEWER,
      namespace: 'MemoryNamespace',
    },
    organizationSelectionFilters: {
      key: FILTER_STATE_KEYS.WvmpSearchFilterType_ORGANIZATION,
      namespace: 'MemoryNamespace',
    },
    industrySelectionFilters: {
      key: FILTER_STATE_KEYS.WvmpSearchFilterType_INDUSTRY,
      namespace: 'MemoryNamespace',
    },
    locationSelectionFilters: {
      key: FILTER_STATE_KEYS.WvmpSearchFilterType_LOCATION,
      namespace: 'MemoryNamespace',
    },
  };
}

export function createProfileViewersPaginationBody(cursor: ProfileViewersPaginationCursor): string {
  const payload = createPaginationPayload(cursor);
  const requestedStateKeys = createRequestedStateKeys();
  const requestMetadata = {
    $type: 'proto.sdui.common.RequestMetadata',
  };

  return JSON.stringify({
    pagerId: PROFILE_VIEWERS_PAGER_ID,
    clientArguments: {
      $type: 'proto.sdui.actions.requests.RequestedArguments',
      payload,
      requestedStateKeys,
      requestMetadata,
      states: createFilterStates(),
      screenId: 'com.linkedin.sdui.flagshipnav.premium.wvmp.WVMP',
    },
    paginationRequest: {
      $type: 'proto.sdui.actions.requests.PaginationRequest',
      pagerId: PROFILE_VIEWERS_PAGER_ID,
      requestedArguments: {
        $type: 'proto.sdui.actions.requests.RequestedArguments',
        payload,
        requestedStateKeys,
        requestMetadata,
      },
      trigger: {
        $case: 'itemDistanceTrigger',
        itemDistanceTrigger: {
          $type: 'proto.sdui.actions.requests.ItemDistanceTrigger',
          preloadDistance: 3,
          preloadLength: 250,
        },
      },
      retryCount: 2,
    },
  });
}

export function extractNextProfileViewersPaginationCursor(payload: string): ProfileViewersPaginationCursor | null {
  const pagerIndex = payload.indexOf(`"pagerId":"${PROFILE_VIEWERS_PAGER_ID}"`);
  if (pagerIndex < 0) {
    return null;
  }

  const paginationContext = payload.slice(pagerIndex, Math.min(payload.length, pagerIndex + 20_000));
  const cursorMatch = paginationContext.match(
    /"payload":\{"start":(\d+),"count":(\d+),"sortType":"ProfileViewSortType_TIME_DESCENDING"/
  );
  if (!cursorMatch) {
    return null;
  }

  const start = Number(cursorMatch[1]);
  const count = Number(cursorMatch[2]);
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count <= 0) {
    return null;
  }

  return { start, count };
}

export function extractProfileViewersPaginationNeeded(payload: string): boolean | null {
  const matches = Array.from(payload.matchAll(/"paginationNeeded"\s*:\s*(true|false)/giu));
  const value = matches[matches.length - 1]?.[1]?.toLowerCase();
  return value === 'true' ? true : value === 'false' ? false : null;
}

export function hasStableProfileViewerOverlap(
  collectedUsernames: string[],
  previousSnapshot: string[],
  minimumOverlap = PROFILE_VIEWERS_STABLE_OVERLAP_SIZE
): boolean {
  if (minimumOverlap <= 0 || previousSnapshot.length < minimumOverlap) {
    return false;
  }

  const normalizedCollected = collectedUsernames.map((username) => username.toLowerCase());
  const normalizedSnapshot = previousSnapshot.map((username) => username.toLowerCase());

  for (let collectedIndex = 0; collectedIndex <= normalizedCollected.length - minimumOverlap; collectedIndex += 1) {
    for (let snapshotIndex = 0; snapshotIndex <= normalizedSnapshot.length - minimumOverlap; snapshotIndex += 1) {
      let matches = true;
      for (let offset = 0; offset < minimumOverlap; offset += 1) {
        if (normalizedCollected[collectedIndex + offset] !== normalizedSnapshot[snapshotIndex + offset]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return true;
      }
    }
  }

  return false;
}

export function shouldStopIncrementalProfileViewerPagination(
  _collectedViewers: ProfileViewerInput[],
  pageViewers: ProfileViewerInput[],
  existingUsernames: Set<string>,
  _previousSnapshot: string[],
  consecutivePagesWithoutNewProfiles: number
): boolean {
  // LinkedIn orders named viewers newest-first. Once a persisted identity is
  // encountered, everything after it belongs to the already imported tail.
  // Free accounts may expose only anonymous rows after the first named page;
  // stop that visible scan on the first empty parsed page and jump directly to
  // the persisted private-summary cursor instead of walking the hidden tail.
  return (
    pageViewers.some((viewer) => existingUsernames.has(viewer.linkedinUsername.toLowerCase())) ||
    (pageViewers.length === 0 && consecutivePagesWithoutNewProfiles >= 1)
  );
}

export function createRecentProfileViewerSnapshot(collectedUsernames: string[], previousSnapshot: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  [...collectedUsernames, ...previousSnapshot].forEach((rawUsername) => {
    const username = rawUsername.trim().toLowerCase();
    if (!username || seen.has(username) || result.length >= PROFILE_VIEWERS_RECENT_SNAPSHOT_LIMIT) {
      return;
    }

    seen.add(username);
    result.push(username);
  });

  return result;
}

export function extendBackfillRecentProfileViewerSnapshot(
  currentSnapshot: string[],
  pageUsernames: string[],
  positionOffset: number
): string[] {
  if (positionOffset >= PROFILE_VIEWERS_RECENT_SNAPSHOT_LIMIT) {
    return currentSnapshot;
  }

  return createRecentProfileViewerSnapshot(currentSnapshot, pageUsernames);
}
