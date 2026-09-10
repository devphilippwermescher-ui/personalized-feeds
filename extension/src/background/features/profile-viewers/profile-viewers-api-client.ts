import type { ProfileViewerInput, ProfileViewerSearchInput } from 'shared/types';
import { fetchWithTimeout } from '../../shared/async/fetch-with-timeout';
import { validateProfileViewersRscPayload } from './profile-viewers-response';
import { parseProfileViewersFromPayload } from './profile-viewers-payload-parser';
import { extractPrivateProfileViewerCount } from './profile-viewer-private-count';
import { extractRecruiterProfileViewerCount, extractRecruiterProfileViewerUrl } from './profile-viewer-recruiter-count';
import {
  createProfileViewersPaginationBody,
  extractNextProfileViewersPaginationCursor,
  extractProfileViewersPaginationNeeded,
  PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
  PROFILE_VIEWERS_PAGER_ID,
  type ProfileViewersPaginationCursor,
} from './profile-viewers-pagination';
import { ProfileViewersSyncError } from './profile-viewers-error';
import type { ProfileViewersSyncErrorCode } from './profile-viewers-sync-state';
import { orderProfileViewersPage } from './utils/page-order';
export { getLinkedInCsrfToken } from '../../platform/linkedin/csrf-token';

const PROFILE_VIEWERS_RSC_TIMEOUT_MS = 20_000;
const PROFILE_VIEWERS_RSC_URL =
  'https://www.linkedin.com/flagship-web/rsc-action/actions/server-request?sduiid=WvmpEntityList';
const PROFILE_VIEWERS_PAGINATION_URL =
  `https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=` +
  encodeURIComponent(PROFILE_VIEWERS_PAGER_ID);
const PROFILE_VIEWERS_RSC_BODY = JSON.stringify({
  requestId: 'WvmpEntityList',
  serverRequest: {
    requestId: 'WvmpEntityList',
    requestedArguments: {
      $type: 'proto.sdui.actions.requests.RequestedArguments',
      payload: { sortType: 'ProfileViewSortType_TIME_DESCENDING', filterTypeList: [] },
      requestedStateKeys: [],
      requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
    },
    isApfcEnabled: false,
    isStreaming: false,
    rumPageKey: '',
  },
  states: [],
  requestedArguments: {
    $type: 'proto.sdui.actions.requests.RequestedArguments',
    payload: { sortType: 'ProfileViewSortType_TIME_DESCENDING', filterTypeList: [] },
    requestedStateKeys: [],
    requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
    states: [],
    screenId: 'com.linkedin.sdui.flagshipnav.home.Home',
  },
});

export interface ProfileViewersRscPage {
  viewers: ProfileViewerInput[];
  searches: ProfileViewerSearchInput[];
  privateViewerCount: number | null;
  recruiterViewerCount: number | null;
  recruiterViewerUrl: string | null;
  httpStatus: number;
  responseLength: number;
  nextCursor: ProfileViewersPaginationCursor | null;
}

export function resolveNextProfileViewersPaginationCursor(options: {
  parsedNextCursor: ProfileViewersPaginationCursor | null;
  requestedCursor?: ProfileViewersPaginationCursor;
  paginationNeeded: boolean | null;
  allowInitialPaginationProbe: boolean;
  hasVisibleViewers: boolean;
}): ProfileViewersPaginationCursor | null {
  if (options.parsedNextCursor) {
    return options.parsedNextCursor;
  }

  if (options.paginationNeeded !== true) {
    return null;
  }

  if (options.requestedCursor) {
    return {
      start: options.requestedCursor.start + options.requestedCursor.count,
      count: options.requestedCursor.count,
    };
  }

  return options.allowInitialPaginationProbe && options.hasVisibleViewers
    ? {
        start: PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
        count: PROFILE_VIEWERS_PAGINATION_PAGE_SIZE,
      }
    : null;
}

async function fetchProfileViewersRscPage(
  url: string,
  body: string,
  csrfToken: string,
  allowInitialPaginationProbe = false,
  requestedCursor?: ProfileViewersPaginationCursor
): Promise<ProfileViewersRscPage> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: '*/*',
          'content-type': 'application/json',
          'csrf-token': csrfToken,
          'x-li-anchor-page-key': 'd_flagship3_leia_wvmp',
          'x-li-rsc-stream': 'true',
        },
        body,
      },
      PROFILE_VIEWERS_RSC_TIMEOUT_MS
    );
  } catch (error) {
    throw new ProfileViewersSyncError(
      error instanceof Error ? error.message : 'LinkedIn profile viewers API network request failed',
      'network_error'
    );
  }

  if (!response.ok) {
    const code: ProfileViewersSyncErrorCode =
      response.status === 401 || response.status === 403 ? 'linkedin_auth_required' : 'api_error';
    throw new ProfileViewersSyncError(
      `LinkedIn profile viewers API request failed with ${response.status}`,
      code,
      response.status
    );
  }

  const payload = await response.text();
  const validation = validateProfileViewersRscPayload(payload);
  if (!validation.valid) {
    throw new ProfileViewersSyncError(
      validation.reason,
      validation.authRequired ? 'linkedin_auth_required' : 'parse_error',
      response.status
    );
  }

  try {
    const viewers = orderProfileViewersPage(parseProfileViewersFromPayload(payload));
    const privateViewerCount = extractPrivateProfileViewerCount(payload);
    const recruiterViewerCount = extractRecruiterProfileViewerCount(payload);
    const recruiterViewerUrl = extractRecruiterProfileViewerUrl(payload);
    const paginationNeeded = extractProfileViewersPaginationNeeded(payload);
    const parsedNextCursor = extractNextProfileViewersPaginationCursor(payload);
    const nextCursor = resolveNextProfileViewersPaginationCursor({
      parsedNextCursor,
      requestedCursor,
      paginationNeeded,
      allowInitialPaginationProbe,
      hasVisibleViewers: viewers.length > 0,
    });

    return {
      viewers,
      searches: [],
      privateViewerCount,
      recruiterViewerCount,
      recruiterViewerUrl,
      httpStatus: response.status,
      responseLength: payload.length,
      nextCursor,
    };
  } catch (error) {
    throw new ProfileViewersSyncError(
      error instanceof Error ? error.message : 'Failed to parse LinkedIn profile viewers response',
      'parse_error',
      response.status
    );
  }
}

export async function fetchProfileViewersFromRsc(csrfToken: string): Promise<ProfileViewersRscPage> {
  return fetchProfileViewersRscPage(PROFILE_VIEWERS_RSC_URL, PROFILE_VIEWERS_RSC_BODY, csrfToken, true);
}

export async function fetchProfileViewersPaginationPage(
  cursor: ProfileViewersPaginationCursor,
  csrfToken: string
): Promise<ProfileViewersRscPage> {
  return fetchProfileViewersRscPage(
    PROFILE_VIEWERS_PAGINATION_URL,
    createProfileViewersPaginationBody(cursor),
    csrfToken,
    false,
    cursor
  );
}
