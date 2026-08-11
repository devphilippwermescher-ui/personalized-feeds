import {
  extractFollowersDailyGrowthFromAnalyticsRsc,
  extractFollowersTotalFromAnalyticsRsc,
  type LinkedInFollowerHistoryPoint,
} from '../linkedin/followers-analytics-rsc-parser';
import {
  collectFollowersAnalyticsRscInLinkedInPage,
  type LinkedInFollowersAnalyticsRscResponse,
} from './linkedin-followers-analytics-page-collector';
import { withPromiseTimeout } from './promise-timeout';

const LINKEDIN_FOLLOWERS_ANALYTICS_COMPONENT_ID =
  'com.linkedin.sdui.generated.creator.analytics.dsl.impl.audienceAnalyticsFollowersModule';
const FOLLOWERS_REQUEST_TIMEOUT_MS = 12_000;
const FOLLOWERS_SCRIPT_TIMEOUT_MS = 15_000;

function toLinkedInDate(timestamp: number): { $type: string; day: number; month: number; year: number } {
  const date = new Date(timestamp);
  return {
    $type: 'proto.sdui.common.Date',
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function createFollowersAnalyticsRequest(collectedAt: number): { url: string; body: string } {
  const trackingBytes = new Uint8Array(8);
  crypto.getRandomValues(trackingBytes);
  const parentSpanId = btoa(String.fromCharCode(...trackingBytes));
  const namespace = 'MemoryNamespace';

  return {
    url:
      'https://www.linkedin.com/flagship-web/rsc-action/actions/component?' +
      `componentId=${encodeURIComponent(LINKEDIN_FOLLOWERS_ANALYTICS_COMPONENT_ID)}` +
      `&sduiid=${encodeURIComponent(LINKEDIN_FOLLOWERS_ANALYTICS_COMPONENT_ID)}` +
      `&parentSpanId=${encodeURIComponent(parentSpanId)}`,
    body: JSON.stringify({
      clientArguments: {
        payload: {
          dateRangeType: { key: 'audience_analytics_state_date_range_binding', namespace },
          lineChartType: { key: 'audience_analytics_chart_type_filter', namespace },
          startDate: { key: 'audience_analytics_state_start_date_binding', namespace },
          endDate: { key: 'audience_analytics_state_end_date_binding', namespace },
        },
        states: [
          {
            key: 'audience_analytics_state_date_range_binding',
            namespace,
            value: 'Past365Days',
            originalProtoCase: 'stringValue',
          },
          {
            key: 'audience_analytics_chart_type_filter',
            namespace,
            value: 'Cumulative',
            originalProtoCase: 'stringValue',
          },
          {
            key: 'audience_analytics_state_start_date_binding',
            namespace,
            value: toLinkedInDate(collectedAt - 364 * 24 * 60 * 60 * 1000),
            originalProtoCase: 'dateValue',
          },
          {
            key: 'audience_analytics_state_end_date_binding',
            namespace,
            value: toLinkedInDate(collectedAt),
            originalProtoCase: 'dateValue',
          },
        ],
        requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
        screenId: 'com.linkedin.sdui.flagshipnav.creatoranalytics.AudienceAnalytics',
        knownTemplateIds: [],
      },
    }),
  };
}

export async function fetchFollowersAnalyticsFromLinkedInTab(
  linkedInTabId: number | undefined,
  csrfToken: string,
  collectedAt: number
): Promise<
  | (LinkedInFollowersAnalyticsRscResponse & {
      followersCount?: number;
      followerDailyGrowth?: LinkedInFollowerHistoryPoint[];
      sourceUrl?: string;
    })
  | null
> {
  if (typeof linkedInTabId !== 'number') return null;

  const request = createFollowersAnalyticsRequest(collectedAt);
  const results = await withPromiseTimeout(
    chrome.scripting.executeScript({
      target: { tabId: linkedInTabId },
      world: 'MAIN',
      func: collectFollowersAnalyticsRscInLinkedInPage,
      args: [csrfToken, request.url, request.body, FOLLOWERS_REQUEST_TIMEOUT_MS],
    }),
    FOLLOWERS_SCRIPT_TIMEOUT_MS,
    'LinkedIn Followers tab script'
  );
  const result = results[0]?.result || null;
  if (result?.httpStatus && [401, 403, 429, 999].includes(result.httpStatus)) {
    const error = new Error(`LinkedIn Audience Analytics request was blocked with ${result.httpStatus}`) as Error & {
      httpStatus?: number;
    };
    error.httpStatus = result.httpStatus;
    throw error;
  }
  return result
    ? {
        ...result,
        followersCount: result.payload ? extractFollowersTotalFromAnalyticsRsc(result.payload) : undefined,
        followerDailyGrowth: result.payload ? extractFollowersDailyGrowthFromAnalyticsRsc(result.payload) : undefined,
        sourceUrl: request.url,
      }
    : null;
}
