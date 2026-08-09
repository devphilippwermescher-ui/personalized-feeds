import type { ProfileAnalyticsSsiSnapshot } from 'shared/types';
import { fetchWithTimeout } from './fetch-with-timeout';
import { collectSocialSellingIndexInLinkedInPage, type LinkedInSsiPageResponse } from './linkedin-ssi-page-collector';
import { parseSocialSellingIndexSnapshot } from './profile-analytics-ssi-parser';

const REQUEST_TIMEOUT_MS = 12_000;

export const SOCIAL_SELLING_INDEX_URL = 'https://www.linkedin.com/sales-api/salesApiSsi';

function throwIfBlocked(status: number | undefined): void {
  if (!status || ![401, 403, 429, 999].includes(status)) return;
  const error = new Error(`LinkedIn Social Selling Index request was blocked with ${status}`) as Error & {
    httpStatus?: number;
  };
  error.httpStatus = status;
  throw error;
}

async function fetchFromLinkedInTab(linkedInTabId: number): Promise<LinkedInSsiPageResponse | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: linkedInTabId },
      world: 'MAIN',
      func: collectSocialSellingIndexInLinkedInPage,
      args: [SOCIAL_SELLING_INDEX_URL],
    });
    const result = results[0]?.result || null;
    // A serialized page-world fetch may fail before receiving an HTTP status.
    // Let the extension-origin request try once in that case.
    return result?.ok || typeof result?.status === 'number' ? result : null;
  } catch (error) {
    console.info('[profile-analytics] SSI request could not run in the LinkedIn tab', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchFromBackground(): Promise<LinkedInSsiPageResponse> {
  const response = await fetchWithTimeout(
    SOCIAL_SELLING_INDEX_URL,
    {
      method: 'GET',
      credentials: 'include',
      headers: { accept: '*/*' },
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
  const activePageResponse = typeof linkedInTabId === 'number' ? await fetchFromLinkedInTab(linkedInTabId) : null;
  const pageResponse: LinkedInSsiPageResponse =
    activePageResponse ||
    (await fetchFromBackground().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })));
  const snapshot = pageResponse.ok
    ? parseSocialSellingIndexSnapshot(pageResponse.payload, collectedAt, SOCIAL_SELLING_INDEX_URL)
    : null;
  if (snapshot) {
    console.info('[profile-analytics] Social Selling Index response parsed', {
      hasValue: true,
      score: snapshot.score,
      source: activePageResponse ? 'linkedin-tab-api' : 'extension-api',
    });
    return snapshot;
  }

  throwIfBlocked(pageResponse.status);
  if (!pageResponse.ok) {
    throw new Error(
      `LinkedIn Social Selling Index endpoint failed${pageResponse.status ? ` with ${pageResponse.status}` : ''}${
        pageResponse.error ? `: ${pageResponse.error}` : ''
      }`
    );
  }

  return null;
}
