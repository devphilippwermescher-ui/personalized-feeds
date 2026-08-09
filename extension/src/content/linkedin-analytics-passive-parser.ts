import { extractFollowersTotalFromAnalyticsRsc } from '../linkedin/followers-analytics-rsc-parser';

export interface PassiveAnalyticsCapture {
  sourceUrl: string;
  capturedAt: number;
  connectionsCount?: number;
  followersCount?: number;
  followersExact?: boolean;
  socialSellingIndexScore?: number;
}

function parseSafeCount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const count = Number(value.replace(/,/g, ''));
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

export function isPassiveAnalyticsUrl(url: string): boolean {
  const normalizedUrl = (() => {
    try {
      return decodeURIComponent(url).toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  return (
    normalizedUrl.includes('/sales-api/salesapissi') ||
    normalizedUrl.includes('/flagship-web/mynetwork/invite-connect/connections') ||
    normalizedUrl.includes('connectionslist') ||
    (normalizedUrl.includes('mynetwork') && normalizedUrl.includes('connection')) ||
    normalizedUrl.includes('audienceanalyticsfollowersmodule') ||
    (normalizedUrl.includes('/voyager/api/graphql') &&
      (normalizedUrl.includes('followers') || normalizedUrl.includes('voyagersearchdashclusters')))
  );
}

export function parsePassiveAnalyticsResponse(
  sourceUrl: string,
  payload: string,
  capturedAt = Date.now()
): PassiveAnalyticsCapture | null {
  if (!sourceUrl || !payload || !isPassiveAnalyticsUrl(sourceUrl)) return null;
  const capture: PassiveAnalyticsCapture = { sourceUrl, capturedAt };
  if (sourceUrl.toLowerCase().includes('/sales-api/salesapissi')) {
    try {
      const parsed = JSON.parse(payload) as { memberScore?: { overall?: unknown } };
      const overall = parsed?.memberScore?.overall;
      if (typeof overall === 'number' && Number.isFinite(overall) && overall >= 0 && overall <= 100) {
        capture.socialSellingIndexScore = Math.round(overall);
      }
    } catch {
      return null;
    }
  } else if (
    sourceUrl.includes('/flagship-web/mynetwork/invite-connect/connections') ||
    sourceUrl.toLowerCase().includes('connectionslist') ||
    (sourceUrl.toLowerCase().includes('mynetwork') && sourceUrl.toLowerCase().includes('connection'))
  ) {
    capture.connectionsCount = parseSafeCount(
      payload.match(
        /"id"\s*:\s*"totalConnectionsCount"[\s\S]{0,500}?"(?:intValue|longValue|stringValue)"\s*:\s*"?([\d,]+)"?/
      )?.[1] || payload.match(/\b([\d,]+)\s+connections\b/i)?.[1]
    );
  } else if (sourceUrl.toLowerCase().includes('audienceanalyticsfollowersmodule')) {
    capture.followersCount = extractFollowersTotalFromAnalyticsRsc(payload);
    capture.followersExact = typeof capture.followersCount === 'number';
  } else {
    capture.followersCount = parseSafeCount(
      payload.match(/"totalResultCount"\s*:\s*(\d+)/)?.[1] ||
        payload.match(/"paging"\s*:\s*\{[\s\S]{0,300}?"total"\s*:\s*(\d+)/)?.[1] ||
        payload.match(/\b([\d,]+)\s+people are following you\b/i)?.[1]
    );
  }
  return typeof capture.connectionsCount === 'number' ||
    typeof capture.followersCount === 'number' ||
    typeof capture.socialSellingIndexScore === 'number'
    ? capture
    : null;
}
