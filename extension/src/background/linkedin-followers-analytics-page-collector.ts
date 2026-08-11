export interface LinkedInFollowersAnalyticsRscResponse {
  payload?: string;
  httpStatus?: number;
  error?: string;
}

/**
 * Runs in the LinkedIn tab's MAIN world. Keep this function self-contained:
 * Chrome serializes it and imported runtime values are unavailable there.
 */
export async function collectFollowersAnalyticsRscInLinkedInPage(
  csrfToken: string,
  requestUrl: string,
  requestBody: string,
  requestTimeoutMs: number
): Promise<LinkedInFollowersAnalyticsRscResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        'csrf-token': csrfToken,
        'x-li-rsc-stream': 'true',
      },
      body: requestBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        httpStatus: response.status,
        error: `LinkedIn Audience Analytics request failed with ${response.status}.`,
      };
    }

    return {
      payload: await response.text(),
      httpStatus: response.status,
    };
  } catch (error) {
    if (timedOut) {
      return { error: `LinkedIn Audience Analytics request timed out after ${requestTimeoutMs}ms.` };
    }
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
