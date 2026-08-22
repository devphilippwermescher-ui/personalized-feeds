import {
  parseContentAnalyticsPostSummary,
  type ContentAnalyticsPostSummaryResult,
} from '../../linkedin/content-analytics/content-analytics-post-summary-parser';
import { getLinkedInCsrfToken } from '../profile-viewers-api-client';
import { withPromiseTimeout } from '../promise-timeout';
import { collectContentAnalyticsRscInLinkedInPage } from './content-analytics-page-collector';
import { throwIfLinkedInBlocked } from './content-analytics-api';
import { DashboardAnalyticsError } from './dashboard-analytics-errors';

const REQUEST_TIMEOUT_MS = 12_000;
const SCRIPT_TIMEOUT_MS = 15_000;

export function createPostSummaryUrl(activityUrn: string): string {
  return `https://www.linkedin.com/flagship-web/analytics/post-summary/${encodeURIComponent(
    activityUrn
  )}?skipRedirect=true`;
}

export interface ContentAnalyticsPostSummaryFetchResult extends ContentAnalyticsPostSummaryResult {
  activityUrn: string;
  sourceUrl: string;
  capturedAt: number;
}

/**
 * Fetches lifetime metrics for one post. The caller bounds how many of these
 * run per sync; nothing here loops over a post list.
 */
export async function fetchContentAnalyticsPostSummary({
  linkedInTabId,
  activityUrn,
  capturedAt = Date.now(),
}: {
  linkedInTabId: number | undefined;
  activityUrn: string;
  capturedAt?: number;
}): Promise<ContentAnalyticsPostSummaryFetchResult> {
  if (typeof linkedInTabId !== 'number') {
    throw new DashboardAnalyticsError('no_linkedin_tab', 'No LinkedIn tab is available for post details.');
  }

  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new DashboardAnalyticsError('linkedin_signed_out', 'No LinkedIn session was found in this browser.');
  }

  const url = createPostSummaryUrl(activityUrn);
  const results = await withPromiseTimeout(
    chrome.scripting.executeScript({
      target: { tabId: linkedInTabId },
      world: 'MAIN',
      func: collectContentAnalyticsRscInLinkedInPage,
      args: [csrfToken, url, null, REQUEST_TIMEOUT_MS],
    }),
    SCRIPT_TIMEOUT_MS,
    'LinkedIn post summary tab script'
  );
  const response = results[0]?.result || null;
  throwIfLinkedInBlocked(response?.httpStatus, 'post summary');

  if (!response?.payload) {
    throw new DashboardAnalyticsError(
      'unsupported_rsc_shape',
      response?.error || 'LinkedIn post summary returned no body.'
    );
  }

  return {
    ...parseContentAnalyticsPostSummary(response.payload),
    activityUrn,
    sourceUrl: url,
    capturedAt,
  };
}
