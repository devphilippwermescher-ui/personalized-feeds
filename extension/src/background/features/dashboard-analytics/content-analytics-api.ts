import {
  parseContentAnalyticsRsc,
  type ContentAnalyticsRscResult,
} from '../../../linkedin/content-analytics/content-analytics-rsc-parser';
import { getLinkedInCsrfToken } from '../../platform/linkedin/csrf-token';
import { withPromiseTimeout } from '../../shared/async/promise-timeout';
import {
  collectContentAnalyticsRscInLinkedInPage,
  type LinkedInContentAnalyticsResponse,
} from './content-analytics-page-collector';
import { DashboardAnalyticsError } from './dashboard-analytics-errors';
import type { ContentAnalyticsRangeRequest } from './content-analytics-range';

export const CONTENT_ANALYTICS_SCREEN_ID = 'com.linkedin.sdui.flagshipnav.creatoranalytics.ContentAnalytics';
export const CONTENT_ANALYTICS_PAGE_URL = 'https://www.linkedin.com/flagship-web/analytics/creator/content/';
export const CONTENT_ANALYTICS_FALLBACK_PAGE_URL = 'https://www.linkedin.com/analytics/creator/content/';

const REQUEST_TIMEOUT_MS = 15_000;
const SCRIPT_TIMEOUT_MS = 18_000;
const STATE_NAMESPACE = 'MemoryNamespace';

export interface ContentAnalyticsFetchResult extends ContentAnalyticsRscResult {
  sourceUrl: string;
  capturedAt: number;
}

function toLinkedInDate(date: string): { $type: string; day: number; month: number; year: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { $type: 'proto.sdui.common.Date', day, month, year };
}

/**
 * Builds the Content Analytics screen request.
 *
 * The state keys mirror the bindings LinkedIn itself sends back in the
 * response (`content_analytics_state_*`), which is also how the sibling
 * Audience Analytics collector in this extension drives its screen.
 */
export function createContentAnalyticsRequest(range: ContentAnalyticsRangeRequest): {
  url: string;
  body: string;
} {
  const query = new URLSearchParams({
    timeRange: range.timeRange,
    metricType: 'IMPRESSIONS',
    startDate: range.startDate,
    endDate: range.endDate,
  });

  return {
    url: `${CONTENT_ANALYTICS_PAGE_URL}?${query.toString()}`,
    body: JSON.stringify({
      clientArguments: {
        payload: {
          dateRangeType: { key: 'content_analytics_state_date_range_binding', namespace: STATE_NAMESPACE },
          metricType: { key: 'content_analytics_metric_type_filter', namespace: STATE_NAMESPACE },
          lineChartType: { key: 'content_analytics_chart_type_filter', namespace: STATE_NAMESPACE },
          startDate: { key: 'content_analytics_state_start_date_binding', namespace: STATE_NAMESPACE },
          endDate: { key: 'content_analytics_state_end_date_binding', namespace: STATE_NAMESPACE },
        },
        states: [
          {
            key: 'content_analytics_state_date_range_binding',
            namespace: STATE_NAMESPACE,
            value: range.linkedInRange,
            originalProtoCase: 'stringValue',
          },
          {
            key: 'content_analytics_metric_type_filter',
            namespace: STATE_NAMESPACE,
            value: 'Impressions',
            originalProtoCase: 'stringValue',
          },
          {
            key: 'content_analytics_chart_type_filter',
            namespace: STATE_NAMESPACE,
            value: 'Daily',
            originalProtoCase: 'stringValue',
          },
          {
            key: 'content_analytics_state_start_date_binding',
            namespace: STATE_NAMESPACE,
            value: toLinkedInDate(range.startDate),
            originalProtoCase: 'dateValue',
          },
          {
            key: 'content_analytics_state_end_date_binding',
            namespace: STATE_NAMESPACE,
            value: toLinkedInDate(range.endDate),
            originalProtoCase: 'dateValue',
          },
        ],
        requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
        screenId: CONTENT_ANALYTICS_SCREEN_ID,
        knownTemplateIds: [],
      },
    }),
  };
}

export function throwIfLinkedInBlocked(status: number | undefined, source: string): void {
  if (!status) return;
  if (status === 429 || status === 999) {
    throw new DashboardAnalyticsError('linkedin_restricted', `LinkedIn ${source} request was blocked with ${status}.`, {
      httpStatus: status,
      retryKind: 'restriction',
    });
  }
  if (status === 401 || status === 403) {
    throw new DashboardAnalyticsError(
      'linkedin_auth_required',
      `LinkedIn ${source} request was rejected with ${status}.`,
      { httpStatus: status }
    );
  }
}

async function runInLinkedInTab(
  linkedInTabId: number,
  csrfToken: string,
  url: string,
  body: string | null
): Promise<LinkedInContentAnalyticsResponse | null> {
  const results = await withPromiseTimeout(
    chrome.scripting.executeScript({
      target: { tabId: linkedInTabId },
      world: 'MAIN',
      func: collectContentAnalyticsRscInLinkedInPage,
      args: [csrfToken, url, body, REQUEST_TIMEOUT_MS],
    }),
    SCRIPT_TIMEOUT_MS,
    'LinkedIn Content Analytics tab script'
  );
  return results[0]?.result || null;
}

function isRscStream(payload: string | undefined): boolean {
  return Boolean(payload && /(^|\n)[0-9a-f]+:/i.test(payload));
}

/**
 * Fetches and parses the Content Analytics screen for one range.
 *
 * The documented POST endpoint is tried first; a GET of the same screen with
 * RSC headers is the fallback, because LinkedIn serves the identical flight
 * stream for a client navigation.
 */
export async function fetchContentAnalyticsForRange({
  linkedInTabId,
  range,
  capturedAt = Date.now(),
}: {
  linkedInTabId: number | undefined;
  range: ContentAnalyticsRangeRequest;
  capturedAt?: number;
}): Promise<ContentAnalyticsFetchResult> {
  if (typeof linkedInTabId !== 'number') {
    throw new DashboardAnalyticsError('no_linkedin_tab', 'No LinkedIn tab is available for Content Analytics.');
  }

  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new DashboardAnalyticsError('linkedin_signed_out', 'No LinkedIn session was found in this browser.');
  }

  const request = createContentAnalyticsRequest(range);
  const fallbackQuery = new URLSearchParams({
    timeRange: range.timeRange,
    metricType: 'IMPRESSIONS',
    startDate: range.startDate,
    endDate: range.endDate,
  });
  const attempts: Array<{ url: string; body: string | null }> = [
    { url: request.url, body: request.body },
    { url: `${CONTENT_ANALYTICS_FALLBACK_PAGE_URL}?${fallbackQuery.toString()}`, body: null },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    let response: LinkedInContentAnalyticsResponse | null = null;
    try {
      response = await runInLinkedInTab(linkedInTabId, csrfToken, attempt.url, attempt.body);
    } catch (error) {
      lastError = error;
      continue;
    }

    throwIfLinkedInBlocked(response?.httpStatus, 'Content Analytics');
    if (!isRscStream(response?.payload)) {
      lastError = new DashboardAnalyticsError(
        'unsupported_rsc_shape',
        response?.error || 'LinkedIn Content Analytics did not return a readable stream.'
      );
      continue;
    }

    try {
      return {
        ...parseContentAnalyticsRsc(response!.payload as string),
        sourceUrl: attempt.url,
        capturedAt,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new DashboardAnalyticsError('sync_failed', 'LinkedIn Content Analytics could not be collected.');
}
