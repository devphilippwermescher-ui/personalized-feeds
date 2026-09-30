import {
  parseContentAnalyticsTopPosts,
  type ContentAnalyticsTopPostsResult,
  type TopPostsMetricType,
} from '../../../linkedin/content-analytics/content-analytics-top-posts-parser';
import { getLinkedInCsrfToken } from '../../platform/linkedin/csrf-token';
import { withPromiseTimeout } from '../../shared/async/promise-timeout';
import { collectLinkedInVoyagerJsonInPage } from './content-analytics-page-collector';
import { throwIfLinkedInBlocked } from './content-analytics-api';
import { DashboardAnalyticsError } from './dashboard-analytics-errors';
import type { ContentAnalyticsRangeRequest } from './content-analytics-range';

/**
 * LinkedIn rotates GraphQL query ids. It is isolated here so an expiry is a
 * one-line change and is reported as `query_id_expired` rather than as an
 * account with no posts.
 */
export const CREATOR_TOP_POSTS_QUERY_ID = 'voyagerPremiumDashLibraView.690c658d1fd446f16255fb87e65d466f';
export const CREATOR_TOP_POSTS_PRODUCT = 'CREATOR_TOP_POSTS';

const REQUEST_TIMEOUT_MS = 15_000;
const SCRIPT_TIMEOUT_MS = 18_000;

export interface ContentAnalyticsTopPostsFetchResult extends ContentAnalyticsTopPostsResult {
  sourceUrl: string;
  capturedAt: number;
  metricType: TopPostsMetricType;
}

export function createTopPostsUrl({
  profileUrn,
  range,
  metricType,
}: {
  profileUrn: string;
  range: ContentAnalyticsRangeRequest;
  metricType: TopPostsMetricType;
}): string {
  const selectedFilters = [
    `(key:timeRange,value:List(${range.timeRange}))`,
    `(key:metricType,value:List(${metricType}))`,
    `(key:startDate,value:List(${range.startDate}))`,
    `(key:endDate,value:List(${range.endDate}))`,
  ].join(',');
  const variables =
    `(product:${CREATOR_TOP_POSTS_PRODUCT},` +
    `targetEntityUrn:${profileUrn},` +
    `query:(selectedFilters:List(${selectedFilters})))`;

  return (
    'https://www.linkedin.com/voyager/api/graphql?' +
    `variables=${encodeURIComponent(variables)}` +
    `&queryId=${CREATOR_TOP_POSTS_QUERY_ID}`
  );
}

/**
 * Collects the base post list.
 *
 * `IMPRESSIONS` is always the base metric: with zero engagements LinkedIn
 * answers the `ENGAGEMENTS` query with an empty state even when posts exist,
 * so using it as the primary source would silently drop every post.
 */
export async function fetchContentAnalyticsTopPosts({
  linkedInTabId,
  profileUrn,
  range,
  metricType = 'IMPRESSIONS',
  capturedAt = Date.now(),
}: {
  linkedInTabId: number | undefined;
  profileUrn: string;
  range: ContentAnalyticsRangeRequest;
  metricType?: TopPostsMetricType;
  capturedAt?: number;
}): Promise<ContentAnalyticsTopPostsFetchResult> {
  if (typeof linkedInTabId !== 'number') {
    throw new DashboardAnalyticsError('no_linkedin_tab', 'No LinkedIn tab is available for Top Posts.');
  }
  if (!profileUrn) {
    throw new DashboardAnalyticsError('source_unavailable', 'Top Posts requires a resolved LinkedIn profile urn.');
  }

  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new DashboardAnalyticsError('linkedin_signed_out', 'No LinkedIn session was found in this browser.');
  }

  const url = createTopPostsUrl({ profileUrn, range, metricType });
  const results = await withPromiseTimeout(
    chrome.scripting.executeScript({
      target: { tabId: linkedInTabId },
      world: 'MAIN',
      func: collectLinkedInVoyagerJsonInPage,
      args: [csrfToken, url, REQUEST_TIMEOUT_MS],
    }),
    SCRIPT_TIMEOUT_MS,
    'LinkedIn Top Posts tab script'
  );
  const response = results[0]?.result || null;
  throwIfLinkedInBlocked(response?.httpStatus, 'Top Posts');

  if (response?.httpStatus === 400 || response?.httpStatus === 404) {
    throw new DashboardAnalyticsError(
      'query_id_expired',
      `LinkedIn rejected the Top Posts query with ${response.httpStatus}.`,
      { httpStatus: response.httpStatus }
    );
  }
  if (!response?.json) {
    throw new DashboardAnalyticsError(
      'unsupported_graphql_shape',
      response?.error || 'LinkedIn Top Posts returned no JSON body.'
    );
  }

  return {
    ...parseContentAnalyticsTopPosts(response.json, metricType),
    sourceUrl: url,
    capturedAt,
    metricType,
  };
}
