export interface LinkedInFollowersSnapshot {
  followersCount?: number;
  httpStatus?: number;
  error?: string;
}

/**
 * Runs in the LinkedIn tab's MAIN world. Keep this function self-contained:
 * Chrome serializes it and imported runtime values are unavailable there.
 */
export async function collectFollowersInLinkedInPage(
  csrfToken: string,
  requestUrl: string
): Promise<LinkedInFollowersSnapshot> {
  try {
    const trackingBytes = new Uint8Array(16);
    crypto.getRandomValues(trackingBytes);
    const trackingId = btoa(String.fromCharCode(...trackingBytes));
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await fetch(requestUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': csrfToken,
        'x-li-lang': 'en_US',
        'x-li-page-instance': `urn:li:page:d_flagship3_curation_hub_pf_followers;${trackingId}`,
        'x-li-track': JSON.stringify({
          clientVersion: '1.13.45639',
          mpVersion: '1.13.45639',
          osName: 'web',
          timezoneOffset: -new Date().getTimezoneOffset() / 60,
          timezone,
          deviceFormFactor: 'DESKTOP',
          mpName: 'voyager-web',
          displayDensity: window.devicePixelRatio || 1,
          displayWidth: window.screen.width,
          displayHeight: window.screen.height,
        }),
        'x-restli-protocol-version': '2.0.0',
      },
    });

    if (!response.ok) {
      return {
        httpStatus: response.status,
        error: `LinkedIn followers request failed with ${response.status}.`,
      };
    }

    const payload = (await response.json()) as {
      data?: {
        data?: {
          searchDashClustersByAll?: {
            metadata?: { totalResultCount?: unknown };
            paging?: { total?: unknown };
          };
        };
      };
    };
    const followersSearch = payload?.data?.data?.searchDashClustersByAll;
    const resultTotal = followersSearch?.metadata?.totalResultCount;
    const pagingTotal = followersSearch?.paging?.total;
    const followersCount =
      typeof resultTotal === 'number' && Number.isFinite(resultTotal)
        ? Math.round(resultTotal)
        : typeof pagingTotal === 'number' && Number.isFinite(pagingTotal)
          ? Math.round(pagingTotal)
          : undefined;

    return {
      httpStatus: response.status,
      followersCount,
      ...(typeof followersCount === 'number'
        ? {}
        : { error: 'LinkedIn followers response did not contain a result total.' }),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
