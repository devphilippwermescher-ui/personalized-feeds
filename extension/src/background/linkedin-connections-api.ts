import { fetchWithTimeout } from './fetch-with-timeout';
import { collectConnectionsInLinkedInPage } from './linkedin-connections-page-collector';
import type { LinkedInConnectionsRscPage, LinkedInConnectionsSnapshot } from './linkedin-connections-types';
import { withPromiseTimeout } from './promise-timeout';

export type { LinkedInConnectionsRscPage, LinkedInConnectionsSnapshot } from './linkedin-connections-types';

const CONNECTIONS_RSC_TIMEOUT_MS = 20_000;
const CONNECTIONS_TAB_REQUEST_TIMEOUT_MS = 10_000;
const CONNECTIONS_TAB_WORK_TIMEOUT_MS = 17_000;
const CONNECTIONS_TAB_SCRIPT_TIMEOUT_MS = 20_000;
const CONNECTIONS_PAGER_ID = 'com.linkedin.sdui.pagers.mynetwork.connectionsList';
const CONNECTIONS_SORT_STATE_KEY = 'connectionsListSortOption';
const CONNECTIONS_SORT_NAMESPACE = 'connectionsListSortOptionMenu';
const CONNECTIONS_SCREEN_ID = 'com.linkedin.sdui.flagshipnav.mynetwork.Connections';
const CONNECTIONS_RSC_URL = 'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections';
const CONNECTIONS_PAGINATION_URL =
  'https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?' +
  `sduiid=${encodeURIComponent(CONNECTIONS_PAGER_ID)}`;
// This is only a malformed-pagination safety stop. Normal bootstrap derives
// its page count from LinkedIn's exact total and may cover large accounts.
const MAX_CONNECTIONS_PAGES_PER_SYNC = 5_000;
const CONNECTIONS_PAGINATION_DELAY_MS = 5_000;
const CONNECTIONS_PAGINATION_BATCH_SIZE = 20;
const CONNECTIONS_PAGINATION_BATCH_COOLDOWN_MS = 60_000;
const RECENT_CONNECTION_IDS_LIMIT = 50;

const CONNECTIONS_RSC_BODY = JSON.stringify({
  $type: 'proto.sdui.actions.core.NavigateToScreen',
  screenId: CONNECTIONS_SCREEN_ID,
  pageKey: 'people_connections',
  presentationStyle: 'PresentationStyle_FULL_PAGE',
  presentation: {
    $case: 'fullPage',
    fullPage: { $type: 'proto.sdui.actions.core.presentation.FullPagePresentation' },
  },
  title: 'Connections',
  url: '/mynetwork/invite-connect/connections',
  inheritActor: false,
  colorScheme: 'ColorScheme_UNKNOWN',
  disableScreenGutters: false,
  shouldHideMobileTopNavBar: false,
  shouldHideLoadingSpinner: false,
  replaceCurrentScreen: false,
  shouldHideMobileTopNavBarDivider: false,
  clearBackStack: false,
  newHierarchy: {
    $type: 'proto.sdui.navigation.ScreenHierarchy',
    screenHash: 'com.linkedin.sdui.flagshipnav.home.Home#0',
    screenId: 'com.linkedin.sdui.flagshipnav.home.Home',
    pageKey: '',
    isAnchorPage: true,
    url: '',
    childHierarchy: {
      $type: 'proto.sdui.navigation.ScreenHierarchy',
      screenHash: 'com.linkedin.sdui.flagshipnav.mynetwork.Connections#0',
      screenId: CONNECTIONS_SCREEN_ID,
      pageKey: '',
      isAnchorPage: true,
      url: '',
    },
  },
  screenTitle: ['Connections'],
  requestedArguments: {
    payload: {},
    states: [],
    requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
    screenId: '',
  },
});

interface LinkedInConnectionsRequestContext {
  applicationInstance?: string;
  applicationVersion?: string;
  pageInstance?: string;
  pageInstanceTrackingId?: string;
  pageForestId?: string;
}

interface LinkedInConnectionsRscResponse {
  payload: string;
  context: LinkedInConnectionsRequestContext;
}

function toDateKey(value: string): string | undefined {
  const timestamp = Date.parse(`${value} UTC`);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

function createConnectionsPaginationBody(startIndex: number): string {
  const requestedStateKeys = [
    {
      key: { value: { $case: 'id', id: CONNECTIONS_SORT_STATE_KEY } },
      namespace: CONNECTIONS_SORT_NAMESPACE,
    },
  ];
  const payload = {
    startIndex,
    sortByOptionBinding: { key: CONNECTIONS_SORT_STATE_KEY, namespace: CONNECTIONS_SORT_NAMESPACE },
  };
  const requestMetadata = { $type: 'proto.sdui.common.RequestMetadata' };
  const requestedArguments = {
    $type: 'proto.sdui.actions.requests.RequestedArguments',
    requestedStateKeys,
    payload,
    requestMetadata,
  };

  return JSON.stringify({
    pagerId: CONNECTIONS_PAGER_ID,
    clientArguments: {
      ...requestedArguments,
      states: [
        {
          key: CONNECTIONS_SORT_STATE_KEY,
          namespace: CONNECTIONS_SORT_NAMESPACE,
          value: 'sortByRecentlyAdded',
          originalProtoCase: 'stringValue',
        },
      ],
      screenId: CONNECTIONS_SCREEN_ID,
    },
    paginationRequest: {
      $type: 'proto.sdui.actions.requests.PaginationRequest',
      pagerId: CONNECTIONS_PAGER_ID,
      requestedArguments,
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

function createPaginationUrl(): string {
  // LinkedIn includes this tracing value on its own pagination requests. It is
  // required by some sessions even though it does not identify the user.
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const parentSpanId = btoa(String.fromCharCode(...bytes));
  return `${CONNECTIONS_PAGINATION_URL}&parentSpanId=${encodeURIComponent(parentSpanId)}`;
}

export function parseLinkedInConnectionsRscPage(payload: string): LinkedInConnectionsRscPage {
  const connectionsCountMatch =
    payload.match(
      /"id"\s*:\s*"totalConnectionsCount"[\s\S]{0,500}?"(?:intValue|longValue|stringValue)"\s*:\s*"?([\d,]+)"?/
    ) || payload.match(/\b([\d,]+)\s+connections\b/i);
  const connectionDateCounts: Record<string, number> = {};
  const connectedOnPattern = /Connected on ([A-Z][a-z]+ \d{1,2}, \d{4})/g;

  for (const match of payload.matchAll(connectedOnPattern)) {
    const dateKey = toDateKey(match[1]);
    if (dateKey) {
      connectionDateCounts[dateKey] = (connectionDateCounts[dateKey] || 0) + 1;
    }
  }

  const nextPageRequestIndex = payload.indexOf('"nextPageRequest"');
  const nextPageContext =
    nextPageRequestIndex >= 0 ? payload.slice(nextPageRequestIndex, nextPageRequestIndex + 2_000) : '';
  const nextStartIndexMatch = nextPageContext.match(/"startIndex":(\d+)/);
  const connectionsCount = Number(connectionsCountMatch?.[1]?.replace(/,/g, ''));
  const nextStartIndex = Number(nextStartIndexMatch?.[1]);
  const connectionIds = Array.from(
    new Set(
      Array.from(payload.matchAll(connectedOnPattern)).flatMap((dateMatch) => {
        const dateIndex = dateMatch.index || 0;
        const context = payload.slice(Math.max(0, dateIndex - 2_000), dateIndex + dateMatch[0].length + 200);
        const matches = Array.from(
          context.matchAll(/(?:https?:\\?\/\\?\/www\.linkedin\.com)?\\?\/in\\?\/([A-Za-z0-9_%.-]+)/g)
        );
        const rawId = matches[matches.length - 1]?.[1];
        if (!rawId) return [];
        try {
          return [decodeURIComponent(rawId).toLowerCase()];
        } catch {
          return [rawId.toLowerCase()];
        }
      })
    )
  );

  return {
    connectionsCount: Number.isSafeInteger(connectionsCount) ? connectionsCount : undefined,
    connectionDateCounts,
    nextStartIndex: Number.isSafeInteger(nextStartIndex) && nextStartIndex > 0 ? nextStartIndex : undefined,
    ...(connectionIds.length > 0 ? { connectionIds } : {}),
  };
}

function mergeConnectionDateCounts(target: Record<string, number>, source: Record<string, number>): void {
  Object.entries(source).forEach(([date, count]) => {
    target[date] = (target[date] || 0) + count;
  });
}

function getResponseHeader(response: Response, name: string): string | undefined {
  return response.headers.get(name) || undefined;
}

async function fetchConnectionsRscPage(
  url: string,
  body: string,
  csrfToken: string,
  context?: LinkedInConnectionsRequestContext
): Promise<LinkedInConnectionsRscResponse> {
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        'csrf-token': csrfToken,
        'x-li-anchor-page-key': 'd_flagship3_people_connections',
        'x-li-rsc-stream': 'true',
        ...(context?.applicationInstance ? { 'x-li-application-instance': context.applicationInstance } : {}),
        ...(context?.applicationVersion ? { 'x-li-application-version': context.applicationVersion } : {}),
        ...(context?.pageInstance ? { 'x-li-page-instance': context.pageInstance } : {}),
        ...(context?.pageInstanceTrackingId
          ? { 'x-li-page-instance-tracking-id': context.pageInstanceTrackingId }
          : {}),
        ...(context?.pageForestId ? { 'x-li-pageforestid': context.pageForestId } : {}),
      },
      body,
    },
    CONNECTIONS_RSC_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`LinkedIn connections API request failed with ${response.status}`);
  }

  return {
    payload: await response.text(),
    context: {
      applicationInstance: getResponseHeader(response, 'x-li-application-instance'),
      applicationVersion: getResponseHeader(response, 'x-li-application-version'),
      pageInstance: getResponseHeader(response, 'x-li-page-instance'),
      pageInstanceTrackingId: getResponseHeader(response, 'x-li-page-instance-tracking-id'),
      pageForestId: getResponseHeader(response, 'x-li-pageforestid'),
    },
  };
}

async function fetchLinkedInConnectionsSnapshotFromBackground(
  csrfToken: string,
  maxPages: number,
  knownConnectionIds: string[] = []
): Promise<LinkedInConnectionsSnapshot> {
  const connectionDateCounts: Record<string, number> = {};
  const visitedStarts = new Set<number>();
  let body = CONNECTIONS_RSC_BODY;
  let url = CONNECTIONS_RSC_URL;
  let connectionsCount: number | undefined;
  let expectedPageCount = maxPages;
  let paginationFailed = false;
  let requestContext: LinkedInConnectionsRequestContext | undefined;
  const knownIds = new Set(knownConnectionIds.map((value) => value.toLowerCase()));
  const recentConnectionIds: string[] = [];

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    let payload: string;
    try {
      const response = await fetchConnectionsRscPage(url, body, csrfToken, requestContext);
      payload = response.payload;
      requestContext = response.context;
    } catch (error) {
      // The initial page is essential for the exact total. A later pagination
      // failure must not discard the valid first-page total or its dates.
      if (pageNumber === 0) {
        throw error;
      }
      paginationFailed = true;
      break;
    }

    const page = parseLinkedInConnectionsRscPage(payload);
    const pageConnectionIds = page.connectionIds || [];
    pageConnectionIds.forEach((id) => {
      if (!recentConnectionIds.includes(id) && recentConnectionIds.length < RECENT_CONNECTION_IDS_LIMIT) {
        recentConnectionIds.push(id);
      }
    });
    // Later pagination pages contain unrelated `totalConnectionsCount`
    // expression values. Preserve the exact total from page zero.
    if (pageNumber === 0 && typeof page.connectionsCount === 'number') {
      connectionsCount = page.connectionsCount;
    }
    mergeConnectionDateCounts(connectionDateCounts, page.connectionDateCounts);
    if (pageConnectionIds.some((id) => knownIds.has(id))) {
      break;
    }
    if (typeof connectionsCount === 'number') {
      expectedPageCount = Math.min(maxPages, Math.max(1, Math.ceil(connectionsCount / 10)));
    }

    if (pageNumber + 1 >= expectedPageCount) {
      break;
    }

    // LinkedIn's later pagination responses do not repeat nextPageRequest.
    // The list page size is 10, so continue deterministically until the exact
    // total reported by the initial response is exhausted.
    const nextStartIndex = page.nextStartIndex || (pageNumber + 1) * 10;
    if (visitedStarts.has(nextStartIndex)) {
      paginationFailed = true;
      break;
    }

    visitedStarts.add(nextStartIndex);
    const paginationDelay =
      (pageNumber + 1) % CONNECTIONS_PAGINATION_BATCH_SIZE === 0
        ? CONNECTIONS_PAGINATION_BATCH_COOLDOWN_MS
        : CONNECTIONS_PAGINATION_DELAY_MS;
    await new Promise((resolve) => setTimeout(resolve, paginationDelay));
    body = createConnectionsPaginationBody(nextStartIndex);
    url = createPaginationUrl();
  }

  const collectedConnectionCount = Object.values(connectionDateCounts).reduce((total, count) => total + count, 0);
  const connectionDateCountsComplete =
    !paginationFailed && typeof connectionsCount === 'number' && collectedConnectionCount === connectionsCount;

  return {
    connectionsCount,
    connectionDateCounts,
    connectionDateCountsComplete,
    ...(recentConnectionIds.length > 0 ? { recentConnectionIds } : {}),
    ...(typeof connectionsCount === 'number' && !connectionDateCountsComplete
      ? {
          error: `LinkedIn returned ${collectedConnectionCount} dated connections out of ${connectionsCount}.`,
        }
      : {}),
  };
}

export async function fetchLinkedInConnectionsSnapshot(
  csrfToken: string,
  linkedInTabId?: number,
  options: { includeHistory?: boolean; knownConnectionIds?: string[]; maxPages?: number } = {}
): Promise<LinkedInConnectionsSnapshot> {
  const includeHistory = options.includeHistory !== false;
  const knownConnectionIds = options.knownConnectionIds || [];
  const defaultMaxPages = includeHistory || knownConnectionIds.length > 0 ? MAX_CONNECTIONS_PAGES_PER_SYNC : 1;
  const maxPages =
    typeof options.maxPages === 'number' && Number.isSafeInteger(options.maxPages) && options.maxPages > 0
      ? Math.min(options.maxPages, defaultMaxPages)
      : defaultMaxPages;

  if (typeof linkedInTabId === 'number') {
    try {
      const results = await withPromiseTimeout(
        chrome.scripting.executeScript({
          target: { tabId: linkedInTabId },
          world: 'MAIN',
          func: collectConnectionsInLinkedInPage,
          args: [
            csrfToken,
            CONNECTIONS_RSC_URL,
            CONNECTIONS_PAGINATION_URL,
            CONNECTIONS_RSC_BODY,
            CONNECTIONS_PAGER_ID,
            CONNECTIONS_SORT_STATE_KEY,
            CONNECTIONS_SORT_NAMESPACE,
            CONNECTIONS_SCREEN_ID,
            maxPages,
            knownConnectionIds,
            CONNECTIONS_PAGINATION_DELAY_MS,
            CONNECTIONS_PAGINATION_BATCH_SIZE,
            CONNECTIONS_PAGINATION_BATCH_COOLDOWN_MS,
            CONNECTIONS_TAB_REQUEST_TIMEOUT_MS,
            CONNECTIONS_TAB_WORK_TIMEOUT_MS,
          ],
        }),
        CONNECTIONS_TAB_SCRIPT_TIMEOUT_MS,
        'LinkedIn Connections tab script'
      );
      const result = results[0]?.result;
      if (result && typeof result === 'object' && 'connectionDateCounts' in result) {
        const snapshot = result as LinkedInConnectionsSnapshot & { error?: string };
        if (snapshot.error) {
          console.info('[profile-analytics] LinkedIn tab pagination stopped early', {
            error: snapshot.error,
            collectedConnectionCount: Object.values(snapshot.connectionDateCounts).reduce(
              (total, count) => total + count,
              0
            ),
            connectionsCount: snapshot.connectionsCount,
          });
        }
        return snapshot;
      }
      return {
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        error: 'LinkedIn did not return a connection-history result from the active tab.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.info('[profile-analytics] LinkedIn tab pagination could not run', { error: message });
      return {
        connectionDateCounts: {},
        connectionDateCountsComplete: false,
        error: `LinkedIn tab pagination could not run: ${message}`,
      };
    }
  }

  return fetchLinkedInConnectionsSnapshotFromBackground(csrfToken, maxPages, knownConnectionIds);
}
