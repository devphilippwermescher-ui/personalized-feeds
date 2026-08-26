import type { ProfileAnalyticsSsiSnapshot } from 'shared/types';
import { fetchWithTimeout } from './fetch-with-timeout';
import type { LinkedInSsiPageResponse } from './linkedin-ssi-page-collector';
import { collectSocialSellingIndexInLinkedInPage } from './linkedin-ssi-page-collector';
import { parseSocialSellingIndexSnapshot } from './profile-analytics-ssi-parser';
import { getLinkedInCsrfToken } from './profile-viewers-api-client';
import { withPromiseTimeout } from './promise-timeout';

const REQUEST_TIMEOUT_MS = 12_000;
const TAB_SCRIPT_TIMEOUT_MS = 12_000;

export const SOCIAL_SELLING_INDEX_URL = 'https://www.linkedin.com/sales-api/salesApiSsi';

function throwIfBlocked(status: number | undefined): void {
  if (!status || ![401, 403, 429, 999].includes(status)) return;
  const error = new Error(`LinkedIn Social Selling Index request was blocked with ${status}`) as Error & {
    httpStatus?: number;
  };
  error.httpStatus = status;
  throw error;
}

async function fetchFromLinkedInTab(
  linkedInTabId: number,
  csrfToken: string
): Promise<LinkedInSsiPageResponse | null> {
  try {
    const results = await withPromiseTimeout(
      chrome.scripting.executeScript({
        target: { tabId: linkedInTabId },
        world: 'MAIN',
        func: collectSocialSellingIndexInLinkedInPage,
        args: [SOCIAL_SELLING_INDEX_URL, csrfToken],
      }),
      TAB_SCRIPT_TIMEOUT_MS,
      'LinkedIn tab SSI script'
    );
    const result = results[0]?.result || null;
    return result?.ok || typeof result?.status === 'number' ? result : null;
  } catch (error) {
    console.info('[profile-analytics] SSI request could not run through the LinkedIn bridge', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchFromBackground(): Promise<LinkedInSsiPageResponse> {
  const csrfToken = await getLinkedInCsrfToken();
  const response = await fetchWithTimeout(
    SOCIAL_SELLING_INDEX_URL,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: '*/*',
        ...(csrfToken
          ? {
              'csrf-token': csrfToken,
              'x-restli-protocol-version': '2.0.0',
            }
          : {}),
      },
    },
    REQUEST_TIMEOUT_MS
  );
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, status: response.status, payload: await response.json() };
}

export async function fetchSocialSellingIndexSnapshot(
  collectedAt: number,
  linkedInTabId?: number
): Promise<ProfileAnalyticsSsiSnapshot | null> {
  const csrfToken = await getLinkedInCsrfToken();
  const backgroundResponse: LinkedInSsiPageResponse = await fetchFromBackground().catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  const backgroundSnapshot = backgroundResponse.ok
    ? parseSocialSellingIndexSnapshot(backgroundResponse.payload, collectedAt, SOCIAL_SELLING_INDEX_URL)
    : null;
  if (backgroundSnapshot) {
    console.info('[profile-analytics] Social Selling Index response parsed', {
      hasValue: true,
      score: backgroundSnapshot.score,
      source: 'extension-api',
    });
    return backgroundSnapshot;
  }

  const activePageResponse =
    typeof linkedInTabId === 'number' ? await fetchFromLinkedInTab(linkedInTabId, csrfToken) : null;
  const activePageSnapshot = activePageResponse?.ok
    ? parseSocialSellingIndexSnapshot(activePageResponse.payload, collectedAt, SOCIAL_SELLING_INDEX_URL)
    : null;
  if (activePageSnapshot) {
    console.info('[profile-analytics] Social Selling Index response parsed', {
      hasValue: true,
      score: activePageSnapshot.score,
      source: 'linkedin-tab-api',
    });
    return activePageSnapshot;
  }

  const failedResponse: LinkedInSsiPageResponse =
    activePageResponse ||
    backgroundResponse || {
      ok: false,
      error: 'No SSI response was available',
    };

  throwIfBlocked(failedResponse.status);
  if (!failedResponse.ok) {
    throw new Error(
      `LinkedIn Social Selling Index endpoint failed${failedResponse.status ? ` with ${failedResponse.status}` : ''}${
        failedResponse.error ? `: ${failedResponse.error}` : ''
      }`
    );
  }

  return null;
}
