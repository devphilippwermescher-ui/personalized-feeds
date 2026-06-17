import type { ProfileViewerInput, ProfileViewerSearchInput } from 'shared/types';
import { fetchWithTimeout } from './fetch-with-timeout';
import { validateProfileViewersRscPayload } from './profile-viewers-response';
import { parseProfileViewersFromPayload } from './profile-viewers-payload-parser';
import { extractProfileViewerSearches } from './profile-viewer-searches';
import { extractPrivateProfileViewerCount } from './profile-viewer-private-count';
import {
  extractRecruiterProfileViewerCount,
  extractRecruiterProfileViewerUrl,
} from './profile-viewer-recruiter-count';
import {
  createProfileViewersPaginationBody,
  extractNextProfileViewersPaginationCursor,
  PROFILE_VIEWERS_PAGER_ID,
  type ProfileViewersPaginationCursor,
} from './profile-viewers-pagination';
import { ProfileViewersSyncError } from './profile-viewers-error';
import type { ProfileViewersSyncErrorCode } from './profile-viewers-sync-state';

const PROFILE_VIEWERS_RSC_TIMEOUT_MS = 20_000;
const PROFILE_VIEWERS_RSC_URL = 'https://www.linkedin.com/flagship-web/rsc-action/actions/server-request?sduiid=WvmpEntityList';
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

function getChromeCookie(details: chrome.cookies.Details): Promise<chrome.cookies.Cookie | null> {
  if (!chrome.cookies?.get) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    chrome.cookies.get(details, (cookie) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(cookie || null);
    });
  });
}

export async function getLinkedInCsrfToken(): Promise<string> {
  const jsessionId = await getChromeCookie({
    url: 'https://www.linkedin.com',
    name: 'JSESSIONID',
  });

  return (jsessionId?.value || '').replace(/^"|"$/g, '');
}

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

async function fetchProfileViewersRscPage(
  url: string,
  body: string,
  csrfToken: string,
  allowPremiumPaginationProbe = false
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
    const viewers = parseProfileViewersFromPayload(payload);
    const searches = extractProfileViewerSearches(payload);
    const privateViewerCount = extractPrivateProfileViewerCount(payload);
    const recruiterViewerCount = extractRecruiterProfileViewerCount(payload);
    const recruiterViewerUrl = extractRecruiterProfileViewerUrl(payload);
    const orderedItems = [
      ...viewers.map((viewer) => ({
        type: 'profile' as const,
        sourceIndex: viewer.sourceIndex ?? Number.MAX_SAFE_INTEGER,
        value: viewer,
      })),
      ...searches.map((search) => ({
        type: 'search' as const,
        sourceIndex: search.sourceIndex ?? Number.MAX_SAFE_INTEGER,
        value: search,
      })),
    ].sort((left, right) => left.sourceIndex - right.sourceIndex);

    orderedItems.forEach((item, listPosition) => {
      item.value.listPosition = listPosition;
    });

    return {
      viewers,
      searches,
      privateViewerCount,
      recruiterViewerCount,
      recruiterViewerUrl,
      httpStatus: response.status,
      responseLength: payload.length,
      nextCursor:
        extractNextProfileViewersPaginationCursor(payload) ||
        (allowPremiumPaginationProbe && viewers.length > 3
          ? { start: 10, count: 10 }
          : null),
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
  return fetchProfileViewersRscPage(
    PROFILE_VIEWERS_RSC_URL,
    PROFILE_VIEWERS_RSC_BODY,
    csrfToken,
    true
  );
}

export async function fetchProfileViewersPaginationPage(
  cursor: ProfileViewersPaginationCursor,
  csrfToken: string
): Promise<ProfileViewersRscPage> {
  return fetchProfileViewersRscPage(
    PROFILE_VIEWERS_PAGINATION_URL,
    createProfileViewersPaginationBody(cursor),
    csrfToken
  );
}
