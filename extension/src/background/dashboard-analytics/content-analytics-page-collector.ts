export interface LinkedInContentAnalyticsResponse {
  payload?: string;
  httpStatus?: number;
  contentType?: string;
  error?: string;
}

export interface LinkedInContentAnalyticsJsonResponse {
  json?: unknown;
  httpStatus?: number;
  error?: string;
}

/**
 * Runs in the signed-in LinkedIn tab's MAIN world.
 *
 * Chrome serializes this function, so it must stay self-contained: imported
 * runtime values are unavailable inside it. It uses the tab's own same-origin
 * session and returns only the response text, never cookies or headers.
 */
export async function collectContentAnalyticsRscInLinkedInPage(
  csrfToken: string,
  requestUrl: string,
  requestBody: string | null,
  requestTimeoutMs: number
): Promise<LinkedInContentAnalyticsResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);

  try {
    const response = await fetch(requestUrl, {
      method: requestBody === null ? 'GET' : 'POST',
      credentials: 'include',
      headers: {
        accept: '*/*',
        'csrf-token': csrfToken,
        'x-li-rsc-stream': 'true',
        ...(requestBody === null ? {} : { 'content-type': 'application/json' }),
      },
      ...(requestBody === null ? {} : { body: requestBody }),
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      return {
        httpStatus: response.status,
        contentType,
        error: `LinkedIn Content Analytics request failed with ${response.status}.`,
      };
    }

    return { payload: await response.text(), httpStatus: response.status, contentType };
  } catch (error) {
    if (timedOut) {
      return { error: `LinkedIn Content Analytics request timed out after ${requestTimeoutMs}ms.` };
    }
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Runs in the signed-in LinkedIn tab's MAIN world for Voyager GraphQL reads.
 * Same self-contained rules as above.
 */
export async function collectLinkedInVoyagerJsonInPage(
  csrfToken: string,
  requestUrl: string,
  requestTimeoutMs: number
): Promise<LinkedInContentAnalyticsJsonResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { httpStatus: response.status, error: `LinkedIn Voyager request failed with ${response.status}.` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      return { httpStatus: response.status, error: `LinkedIn Voyager returned ${contentType || 'no content type'}.` };
    }

    return { json: await response.json(), httpStatus: response.status };
  } catch (error) {
    if (timedOut) return { error: `LinkedIn Voyager request timed out after ${requestTimeoutMs}ms.` };
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
