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
  requestBody: string
): Promise<LinkedInFollowersAnalyticsRscResponse> {
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
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
