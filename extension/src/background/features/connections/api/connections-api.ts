import { withPromiseTimeout } from '../../../shared/async/promise-timeout';
import { collectConnectionsInLinkedInPage } from './connections-page-collector';
import type { LinkedInConnectionsSnapshot } from '../types';

export type { LinkedInConnectionsRscPage, LinkedInConnectionsSnapshot } from '../types';
export { parseLinkedInConnectionsRscPage } from '../parsers/connections-parser';

const CONNECTIONS_TAB_REQUEST_TIMEOUT_MS = 10_000;
const CONNECTIONS_TAB_WORK_TIMEOUT_MS = 40_000;
const CONNECTIONS_TAB_SCRIPT_TIMEOUT_MS = 45_000;
const CONNECTIONS_PAGER_ID = 'com.linkedin.sdui.pagers.mynetwork.connectionsList';
const CONNECTIONS_SORT_STATE_KEY = 'connectionsListSortOption';
const CONNECTIONS_SORT_NAMESPACE = 'connectionsListSortOptionMenu';
const CONNECTIONS_SCREEN_ID = 'com.linkedin.sdui.flagshipnav.mynetwork.Connections';
const CONNECTIONS_RSC_URL = 'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections';
const CONNECTIONS_PAGINATION_URL =
  'https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?' +
  `sduiid=${encodeURIComponent(CONNECTIONS_PAGER_ID)}`;
const MAX_CONNECTIONS_PAGES_PER_SYNC = 5_000;
const CONNECTIONS_PAGINATION_DELAY_MS = 2_500;
const CONNECTIONS_PAGINATION_BATCH_SIZE = 10;
const CONNECTIONS_PAGINATION_BATCH_COOLDOWN_MS = 60_000;

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

export async function fetchLinkedInConnectionsSnapshot(
  csrfToken: string,
  linkedInTabId?: number,
  options: {
    includeHistory?: boolean;
    knownConnectionIds?: string[];
    maxPages?: number;
    startIndex?: number;
    paginationDelayMs?: number;
    paginationBatchSize?: number;
    paginationBatchCooldownMs?: number;
    requestTimeoutMs?: number;
    workTimeoutMs?: number;
    scriptTimeoutMs?: number;
  } = {}
): Promise<LinkedInConnectionsSnapshot> {
  const includeHistory = options.includeHistory !== false;
  const knownConnectionIds = options.knownConnectionIds || [];
  const defaultMaxPages = includeHistory || knownConnectionIds.length > 0 ? MAX_CONNECTIONS_PAGES_PER_SYNC : 1;
  const maxPages =
    typeof options.maxPages === 'number' && Number.isSafeInteger(options.maxPages) && options.maxPages > 0
      ? Math.min(options.maxPages, defaultMaxPages)
      : defaultMaxPages;
  const startIndex =
    typeof options.startIndex === 'number' && Number.isSafeInteger(options.startIndex) && options.startIndex > 0
      ? options.startIndex
      : 0;
  const positiveNumber = (value: number | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  const nonNegativeInteger = (value: number | undefined, fallback: number) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  const paginationDelayMs = positiveNumber(options.paginationDelayMs, CONNECTIONS_PAGINATION_DELAY_MS);
  const paginationBatchSize = nonNegativeInteger(options.paginationBatchSize, CONNECTIONS_PAGINATION_BATCH_SIZE);
  const paginationBatchCooldownMs = positiveNumber(
    options.paginationBatchCooldownMs,
    CONNECTIONS_PAGINATION_BATCH_COOLDOWN_MS
  );
  const requestTimeoutMs = positiveNumber(options.requestTimeoutMs, CONNECTIONS_TAB_REQUEST_TIMEOUT_MS);
  const workTimeoutMs = positiveNumber(options.workTimeoutMs, CONNECTIONS_TAB_WORK_TIMEOUT_MS);
  const scriptTimeoutMs = positiveNumber(options.scriptTimeoutMs, CONNECTIONS_TAB_SCRIPT_TIMEOUT_MS);

  if (typeof linkedInTabId !== 'number') {
    return {
      connectionDateCounts: {},
      connectionDateCountsComplete: false,
      nextStartIndex: startIndex || undefined,
      error: 'An existing LinkedIn tab is required to collect Connections.',
    };
  }

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
          startIndex,
          knownConnectionIds,
          paginationDelayMs,
          paginationBatchSize,
          paginationBatchCooldownMs,
          requestTimeoutMs,
          workTimeoutMs,
        ],
      }),
      scriptTimeoutMs,
      'LinkedIn Connections tab script'
    );
    const result = results[0]?.result;
    if (result && typeof result === 'object' && 'connectionDateCounts' in result) {
      const snapshot = result as LinkedInConnectionsSnapshot;
      if (snapshot.error) {
        console.info('[profile-analytics] LinkedIn tab pagination stopped early', {
          error: snapshot.error,
          collectedConnectionCount: Object.values(snapshot.connectionDateCounts).reduce(
            (total, count) => total + count,
            0
          ),
          connectionsCount: snapshot.connectionsCount,
          nextStartIndex: snapshot.nextStartIndex,
        });
      }
      return snapshot;
    }
    return {
      connectionDateCounts: {},
      connectionDateCountsComplete: false,
      nextStartIndex: startIndex || undefined,
      error: 'LinkedIn did not return a connection-history result from the existing tab.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.info('[profile-analytics] LinkedIn tab pagination could not run', { error: message });
    return {
      connectionDateCounts: {},
      connectionDateCountsComplete: false,
      nextStartIndex: startIndex || undefined,
      error: `LinkedIn tab pagination could not run: ${message}`,
    };
  }
}
