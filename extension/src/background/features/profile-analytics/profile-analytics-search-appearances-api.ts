import type { ProfileAnalyticsSearchAppearancesSnapshot } from 'shared/types';
import { fetchWithTimeout } from '../../shared/async/fetch-with-timeout';
import { getLinkedInCsrfToken } from '../../platform/linkedin/csrf-token';
import { parseSearchAppearancesSnapshot } from './profile-analytics-search-appearances-parser';

const REQUEST_TIMEOUT_MS = 12_000;
const SEARCH_APPEARANCES_QUERY_ID = 'voyagerPremiumDashAnalyticsView.677f8e447e2d15652410d574abfe1d1e';
const SEARCH_APPEARANCES_VARIABLES =
  '(analyticsEntityUrn:(activityUrn:urn%3Ali%3Adummy%3A-1),query:(),surfaceType:SEARCH_APPEARANCES)';

export const SEARCH_APPEARANCES_URL =
  'https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true' +
  `&variables=${SEARCH_APPEARANCES_VARIABLES}` +
  `&queryId=${SEARCH_APPEARANCES_QUERY_ID}`;

export async function fetchSearchAppearancesSnapshot(
  collectedAt: number
): Promise<ProfileAnalyticsSearchAppearancesSnapshot | null> {
  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) return null;

  const response = await fetchWithTimeout(
    SEARCH_APPEARANCES_URL,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
      },
    },
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    if ([401, 403, 429, 999].includes(response.status)) {
      const error = new Error(`LinkedIn Search Appearances request was blocked with ${response.status}`) as Error & {
        httpStatus?: number;
      };
      error.httpStatus = response.status;
      throw error;
    }
    console.info('[profile-analytics] Search Appearances endpoint returned non-OK status', {
      status: response.status,
    });
    return null;
  }

  const payload: unknown = await response.json();
  const snapshot = parseSearchAppearancesSnapshot(payload, collectedAt, SEARCH_APPEARANCES_URL);
  console.info('[profile-analytics] Search Appearances response parsed', {
    hasValue: typeof snapshot?.totalCount === 'number',
    totalCount: snapshot?.totalCount,
    periodLabel: snapshot?.periodLabel,
  });
  return snapshot;
}
