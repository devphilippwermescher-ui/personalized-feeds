import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';
import { fetchWithTimeout } from './fetch-with-timeout';
import { getLinkedInCsrfToken } from './profile-viewers-api-client';

const LINKEDIN_ME_URL = 'https://www.linkedin.com/voyager/api/me';
const LINKEDIN_PROFILE_VIEW_TIMEOUT_MS = 12000;
const LINKEDIN_NETWORK_INFO_TIMEOUT_MS = 12000;
const LINKEDIN_PROFILE_HTML_TIMEOUT_MS = 12000;
const LINKEDIN_FOLLOWERS_PAGE_TIMEOUT_MS = 12000;
const LINKEDIN_ME_TIMEOUT_MS = 12000;
const LINKEDIN_FOLLOWERS_PAGE_URL =
  'https://www.linkedin.com/flagship-web/mynetwork/network-manager/people-follow/followers/';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compactJoin(parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim() || '').filter(Boolean).join(', ');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/');
}

function getNestedRecord(root: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }

  return isRecord(current) ? current : null;
}

function findIncludedEntity(payload: unknown, entityUrn: string): Record<string, unknown> | null {
  if (!isRecord(payload) || !Array.isArray(payload.included) || !entityUrn) {
    return null;
  }

  return payload.included
    .filter(isRecord)
    .find((record) => getString(record.entityUrn) === entityUrn) || null;
}

function findFirstRecord(value: unknown, predicate: (record: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstRecord(item, predicate);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (predicate(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    const match = findFirstRecord(nested, predicate);
    if (match) {
      return match;
    }
  }

  return null;
}

function findFirstNumberByKey(value: unknown, keyPattern: RegExp): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstNumberByKey(item, keyPattern);
      if (typeof match === 'number') {
        return match;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (keyPattern.test(key) && typeof nested === 'number' && Number.isFinite(nested)) {
      return Math.round(nested);
    }
  }

  for (const nested of Object.values(value)) {
    const match = findFirstNumberByKey(nested, keyPattern);
    if (typeof match === 'number') {
      return match;
    }
  }

  return undefined;
}

function parseLinkedInCount(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/^\$n/, '').replace(/[,\s]/g, '').trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)([kKmM])?\+?/);
  if (!match) {
    return undefined;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return undefined;
  }

  const suffix = (match[2] || '').toLowerCase();
  if (suffix === 'k') return Math.round(base * 1000);
  if (suffix === 'm') return Math.round(base * 1000000);
  return Math.round(base);
}

function findFirstStringByKey(value: unknown, keyPattern: RegExp): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstStringByKey(item, keyPattern);
      if (match) {
        return match;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (keyPattern.test(key)) {
      const value = getString(nested);
      if (value) {
        return value;
      }
    }
  }

  for (const nested of Object.values(value)) {
    const match = findFirstStringByKey(nested, keyPattern);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function chooseVectorImageUrl(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }

  const rootUrl = getString(value.rootUrl);
  const artifacts = Array.isArray(value.artifacts) ? value.artifacts : [];
  const candidates = artifacts
    .filter(isRecord)
    .map((artifact) => ({
      width: typeof artifact.width === 'number' ? artifact.width : 0,
      segment: getString(artifact.fileIdentifyingUrlPathSegment),
    }))
    .filter((artifact) => artifact.segment)
    .sort((left, right) => right.width - left.width);

  if (!rootUrl || !candidates[0]) {
    return '';
  }

  return rootUrl.includes('*')
    ? rootUrl.replace('*', candidates[0].segment)
    : `${rootUrl}${candidates[0].segment}`;
}

async function fetchLinkedInJson(url: string, csrfToken: string, timeoutMs: number): Promise<unknown | null> {
  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
      },
    },
    timeoutMs
  );

  if (!response.ok) {
    console.info('[profile-analytics] LinkedIn JSON endpoint returned non-OK status', {
      url,
      status: response.status,
    });
    return null;
  }

  const json = await response.json();
  console.info('[profile-analytics] LinkedIn JSON endpoint fetched', {
    url,
    status: response.status,
  });
  return json;
}

async function fetchLinkedInHtml(url: string, timeoutMs: number): Promise<string> {
  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    },
    timeoutMs
  );

  if (!response.ok) {
    console.info('[profile-analytics] LinkedIn HTML endpoint returned non-OK status', {
      url,
      status: response.status,
    });
    return '';
  }

  const html = await response.text();
  console.info('[profile-analytics] LinkedIn HTML endpoint fetched', {
    url,
    status: response.status,
    length: html.length,
  });
  return html;
}

function extractMiniProfile(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }

  const referencedMiniProfile = getString(getNestedRecord(payload, ['data'])?.['*miniProfile']);
  const referencedMiniProfileEntity = findIncludedEntity(payload, referencedMiniProfile);
  if (referencedMiniProfileEntity) {
    return referencedMiniProfileEntity;
  }

  return (
    getNestedRecord(payload, ['miniProfile']) ||
    findFirstRecord(payload.included, (record) => getString(record.publicIdentifier) !== '') ||
    findFirstRecord(payload, (record) => getString(record.publicIdentifier) !== '')
  );
}

function profileSnapshotFromMiniProfile(
  miniProfile: Record<string, unknown>,
  collectedAt: number,
  sourceUrl: string
): ProfileAnalyticsProfileSnapshot | null {
  const linkedinUsername = getString(miniProfile.publicIdentifier);
  if (!linkedinUsername) {
    return null;
  }

  const firstName = getString(miniProfile.firstName);
  const lastName = getString(miniProfile.lastName);
  const displayName = `${firstName} ${lastName}`.trim() || getString(miniProfile.name);
  if (!displayName) {
    return null;
  }

  return {
    linkedinUrl: `https://www.linkedin.com/in/${linkedinUsername}/`,
    linkedinUsername,
    profileUrn: getString(miniProfile.dashEntityUrn) || getString(miniProfile.entityUrn) || undefined,
    memberNumericId: getString(miniProfile.objectUrn).match(/urn:li:member:(\d+)/)?.[1],
    displayName,
    headline: getString(miniProfile.occupation),
    profileImageUrl: chooseVectorImageUrl(miniProfile.picture),
    backgroundImageUrl: chooseVectorImageUrl(miniProfile.backgroundImage),
    updatedAt: collectedAt,
    sourceUrl,
  };
}

function profileSnapshotFromProfileView(
  payload: unknown,
  fallback: ProfileAnalyticsProfileSnapshot,
  collectedAt: number,
  sourceUrl: string
): ProfileAnalyticsProfileSnapshot {
  const root = isRecord(payload) ? payload : {};
  const miniProfile = extractMiniProfile(payload);
  const data = isRecord(root.data) ? root.data : root;
  const profile = isRecord(data.profile) ? data.profile : isRecord(root.profile) ? root.profile : data;
  const displayName =
    `${getString(profile.firstName || miniProfile?.firstName)} ${getString(profile.lastName || miniProfile?.lastName)}`.trim() ||
    fallback.displayName;
  const connectionsCount = findFirstNumberByKey(
    payload,
    /^(?:connectionsCount|connectionCount|numConnections|memberConnectionsCount|numberOfConnections)$/i
  );
  const followersCount = findFirstNumberByKey(
    payload,
    /^(?:followersCount|followerCount|memberFollowersCount|numberOfFollowers)$/i
  );
  const city = getString(profile.geoLocationName) || getString(profile.locationName) || findFirstStringByKey(
    payload,
    /^(?:geoLocationName|locationName)$/i
  );
  const country = getString(profile.geoCountryName) || findFirstStringByKey(payload, /^geoCountryName$/i);
  const location =
    compactJoin([city, country]) ||
    getString(profile.location) ||
    fallback.location;

  return {
    ...fallback,
    linkedinUrl: fallback.linkedinUrl,
    linkedinUsername: fallback.linkedinUsername,
    profileUrn: getString(profile.entityUrn) || fallback.profileUrn,
    displayName,
    headline: getString(profile.headline) || getString(miniProfile?.occupation) || fallback.headline,
    profileImageUrl:
      chooseVectorImageUrl(profile.picture) ||
      chooseVectorImageUrl(miniProfile?.picture) ||
      fallback.profileImageUrl,
    backgroundImageUrl:
      chooseVectorImageUrl(profile.backgroundImage) ||
      chooseVectorImageUrl(miniProfile?.backgroundImage) ||
      fallback.backgroundImageUrl,
    location,
    company: fallback.company,
    connectionsCount: connectionsCount ?? fallback.connectionsCount,
    followersCount: followersCount ?? fallback.followersCount,
    updatedAt: collectedAt,
    sourceUrl,
  };
}

function profileSnapshotFromNetworkInfo(
  payload: unknown,
  fallback: ProfileAnalyticsProfileSnapshot,
  collectedAt: number,
  sourceUrl: string
): ProfileAnalyticsProfileSnapshot {
  const connectionsCount = findFirstNumberByKey(
    payload,
    /^(?:connectionsCount|connectionCount|numConnections|memberConnectionsCount|numberOfConnections|firstDegreeSize)$/i
  );
  const followersCount = findFirstNumberByKey(
    payload,
    /^(?:followersCount|followerCount|memberFollowersCount|numberOfFollowers|followerSize)$/i
  );
  const city = findFirstStringByKey(payload, /^(?:geoLocationName|locationName)$/i);
  const country = findFirstStringByKey(payload, /^geoCountryName$/i);

  return {
    ...fallback,
    location: compactJoin([city, country]) || fallback.location,
    connectionsCount: connectionsCount ?? fallback.connectionsCount,
    followersCount: followersCount ?? fallback.followersCount,
    updatedAt: collectedAt,
    sourceUrl,
  };
}

function extractStringFromHtmlJson(html: string, key: string): string | undefined {
  const decodedHtml = decodeHtml(html);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`"${escapedKey}"\\s*:\\s*"([^"]+)"`, 'i'),
    new RegExp(`\\\\"${escapedKey}\\\\"\\s*:\\s*\\\\"([^"\\\\]+)\\\\"`, 'i'),
  ];

  for (const pattern of patterns) {
    const value = decodeHtml(decodedHtml.match(pattern)?.[1] || '').trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function isLikelyProfileLocation(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 90 || !normalized.includes(',')) {
    return false;
  }

  return !/[|<>/@]/.test(normalized) &&
    !/\b(?:connections?|followers?|contact info|linkedin|developer|firebase|chrome|extension|mobile|apps|rest|apis|bloc|dart)\b/i.test(normalized);
}

function extractQuotedStrings(value: string): string[] {
  const decoded = decodeHtml(value);
  return Array.from(decoded.matchAll(/"([^"\\]{2,120})"/g))
    .map((match) => decodeHtml(match[1]).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function extractLocationFromProfileHtml(html: string): string | undefined {
  const decoded = decodeHtml(html).replace(/\s+/g, ' ');
  const structuredLocation =
    extractStringFromHtmlJson(decoded, 'geoLocationName') ||
    extractStringFromHtmlJson(decoded, 'locationName');
  const structuredCountry = extractStringFromHtmlJson(decoded, 'geoCountryName');
  const keyedLocation = compactJoin([structuredLocation, structuredCountry]);
  if (keyedLocation) {
    return keyedLocation;
  }

  const contactInfoIndex = decoded.toLowerCase().indexOf('contact info');
  if (contactInfoIndex >= 0) {
    const beforeContactInfo = decoded.slice(Math.max(0, contactInfoIndex - 5000), contactInfoIndex);
    const quotedCandidate = extractQuotedStrings(beforeContactInfo).reverse().find(isLikelyProfileLocation);
    if (quotedCandidate) {
      return quotedCandidate;
    }

    const textCandidate = Array.from(beforeContactInfo.matchAll(/([A-ZА-ЯІЇЄҐ][^"<>{}]{1,70},\s*[A-ZА-ЯІЇЄҐ][^"<>{}]{1,70})/g))
      .map((match) => match[1].replace(/\s+/g, ' ').trim())
      .reverse()
      .find(isLikelyProfileLocation);
    if (textCandidate) {
      return textCandidate;
    }
  }

  return undefined;
}

function extractCountFromHtml(html: string, label: 'connections' | 'followers'): number | undefined {
  const decoded = decodeHtml(html).replace(/\s+/g, ' ');
  const jsonCount = extractStringFromHtmlJson(decoded, `${label}Count`) ||
    extractStringFromHtmlJson(decoded, label === 'connections' ? 'connectionCount' : 'followerCount') ||
    extractStringFromHtmlJson(decoded, label === 'connections' ? 'numConnections' : 'numFollowers') ||
    extractStringFromHtmlJson(decoded, label === 'connections' ? 'numberOfConnections' : 'numberOfFollowers');
  const parsedJsonCount = parseLinkedInCount(jsonCount);
  if (typeof parsedJsonCount === 'number') {
    return parsedJsonCount;
  }

  const labelRegex = new RegExp(`([\\d,.]+(?:[kKmM])?\\+?)\\s+${label}\\b`, 'i');
  return parseLinkedInCount(decoded.match(labelRegex)?.[1]);
}

function extractFollowersCountFromFollowersPage(html: string): number | undefined {
  const decoded = decodeHtml(html).replace(/\s+/g, ' ');
  const directLabelMatch = decoded.match(/(\$?n?[\d,.]+(?:[kKmM])?)\s+people\s+are\s+following\s+you\b/i);
  const directLabelCount = parseLinkedInCount(directLabelMatch?.[1]);
  if (typeof directLabelCount === 'number') {
    return directLabelCount;
  }

  const statePatterns = [
    /"id":"[^"]*(?:totalFollowersCount|followersCount|followerCount|followers)[^"]*"[^{}]{0,500}?"(?:intValue|longValue|doubleValue)":(?:"?\$?n?)([\d,.]+)"?/i,
    /(?:totalFollowersCount|followersCount|followerCount|followers)[^{}]{0,500}?"(?:intValue|longValue|doubleValue)":(?:"?\$?n?)([\d,.]+)"?/i,
  ];
  for (const pattern of statePatterns) {
    const stateCount = parseLinkedInCount(decoded.match(pattern)?.[1]);
    if (typeof stateCount === 'number') {
      return stateCount;
    }
  }

  const phraseMatch = decoded.match(/people\s+are\s+following\s+you\b/i);
  if (phraseMatch && typeof phraseMatch.index === 'number') {
    const beforePhrase = decoded.slice(Math.max(0, phraseMatch.index - 600), phraseMatch.index);
    const countMatches = Array.from(beforePhrase.matchAll(/\$?n?[\d,.]+(?:[kKmM])?/g))
      .map((match) => parseLinkedInCount(match[0]))
      .filter((value): value is number => typeof value === 'number' && value >= 0);
    const nearbyCount = countMatches[countMatches.length - 1];
    if (typeof nearbyCount === 'number') {
      return nearbyCount;
    }
  }

  const fallbackCount = extractCountFromHtml(decoded, 'followers');
  if (typeof fallbackCount === 'number') {
    return fallbackCount;
  }

  const diagnosticMatches = ['people are following you', 'Followers', 'followers']
    .map((label) => {
      const index = decoded.toLowerCase().indexOf(label.toLowerCase());
      return index >= 0 ? decoded.slice(Math.max(0, index - 250), index + 350) : '';
    })
    .filter(Boolean);
  if (diagnosticMatches.length > 0) {
    console.info('[profile-analytics] followers page unmatched snippets', diagnosticMatches);
  }

  return undefined;
}

function profileSnapshotFromFollowersPage(
  html: string,
  fallback: ProfileAnalyticsProfileSnapshot,
  collectedAt: number,
  sourceUrl: string
): ProfileAnalyticsProfileSnapshot {
  if (!html) {
    return fallback;
  }

  const followersCount = extractFollowersCountFromFollowersPage(html);
  console.info('[profile-analytics] followers page parsed fields', {
    followersCount,
  });

  return {
    ...fallback,
    followersCount: followersCount ?? fallback.followersCount,
    updatedAt: collectedAt,
    sourceUrl,
  };
}

function profileSnapshotFromProfileHtml(
  html: string,
  fallback: ProfileAnalyticsProfileSnapshot,
  collectedAt: number,
  sourceUrl: string
): ProfileAnalyticsProfileSnapshot {
  if (!html) {
    return fallback;
  }

  const city =
    extractStringFromHtmlJson(html, 'geoLocationName') ||
    extractStringFromHtmlJson(html, 'locationName');
  const country = extractStringFromHtmlJson(html, 'geoCountryName');
  const location = compactJoin([city, country]) || extractLocationFromProfileHtml(html) || fallback.location;
  const connectionsCount = extractCountFromHtml(html, 'connections');
  const followersCount = extractCountFromHtml(html, 'followers');
  console.info('[profile-analytics] HTML fallback parsed profile fields', {
    hasLocation: Boolean(location),
    connectionsCount,
    followersCount,
  });

  return {
    ...fallback,
    location,
    connectionsCount: connectionsCount ?? fallback.connectionsCount,
    followersCount: followersCount ?? fallback.followersCount,
    updatedAt: collectedAt,
    sourceUrl,
  };
}

export async function fetchLinkedInMeProfileSnapshot(
  collectedAt: number
): Promise<ProfileAnalyticsProfileSnapshot | null> {
  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    return null;
  }

  const mePayload = await fetchLinkedInJson(LINKEDIN_ME_URL, csrfToken, LINKEDIN_ME_TIMEOUT_MS);
  const miniProfile = extractMiniProfile(mePayload);
  if (!miniProfile) {
    return null;
  }

  const meSnapshot = profileSnapshotFromMiniProfile(miniProfile, collectedAt, LINKEDIN_ME_URL);
  if (!meSnapshot) {
    return null;
  }
  console.info('[profile-analytics] /voyager/api/me parsed profile fields', {
    linkedinUsername: meSnapshot.linkedinUsername,
    hasDisplayName: Boolean(meSnapshot.displayName),
    hasHeadline: Boolean(meSnapshot.headline),
    hasAvatar: Boolean(meSnapshot.profileImageUrl),
    hasBackground: Boolean(meSnapshot.backgroundImageUrl),
  });

  const profileViewUrl =
    `https://www.linkedin.com/voyager/api/identity/profiles/` +
    `${encodeURIComponent(meSnapshot.linkedinUsername)}/profileView`;
  const profileViewPayload = await fetchLinkedInJson(
    profileViewUrl,
    csrfToken,
    LINKEDIN_PROFILE_VIEW_TIMEOUT_MS
  ).catch(() => null);

  const profileViewSnapshot = profileViewPayload
    ? profileSnapshotFromProfileView(profileViewPayload, meSnapshot, collectedAt, profileViewUrl)
    : meSnapshot;

  const networkInfoUrl =
    `https://www.linkedin.com/voyager/api/identity/profiles/` +
    `${encodeURIComponent(meSnapshot.linkedinUsername)}/networkinfo`;
  const networkInfoPayload = await fetchLinkedInJson(
    networkInfoUrl,
    csrfToken,
    LINKEDIN_NETWORK_INFO_TIMEOUT_MS
  ).catch(() => null);
  const networkInfoSnapshot = networkInfoPayload
    ? profileSnapshotFromNetworkInfo(networkInfoPayload, profileViewSnapshot, collectedAt, networkInfoUrl)
    : profileViewSnapshot;
  console.info('[profile-analytics] profile detail parsed fields', {
    sourceUrl: networkInfoSnapshot.sourceUrl,
    location: networkInfoSnapshot.location,
    connectionsCount: networkInfoSnapshot.connectionsCount,
    followersCount: networkInfoSnapshot.followersCount,
  });

  const needsHtmlFallback =
    !networkInfoSnapshot.location ||
    typeof networkInfoSnapshot.connectionsCount !== 'number' ||
    typeof networkInfoSnapshot.followersCount !== 'number';

  if (!needsHtmlFallback) {
    return networkInfoSnapshot;
  }

  const profileHtml = await fetchLinkedInHtml(
    networkInfoSnapshot.linkedinUrl,
    LINKEDIN_PROFILE_HTML_TIMEOUT_MS
  ).catch(() => '');

  const htmlSnapshot = profileSnapshotFromProfileHtml(
    profileHtml,
    networkInfoSnapshot,
    collectedAt,
    networkInfoSnapshot.linkedinUrl
  );

  if (typeof htmlSnapshot.followersCount === 'number') {
    return htmlSnapshot;
  }

  const followersPageHtml = await fetchLinkedInHtml(
    LINKEDIN_FOLLOWERS_PAGE_URL,
    LINKEDIN_FOLLOWERS_PAGE_TIMEOUT_MS
  ).catch(() => '');

  return profileSnapshotFromFollowersPage(
    followersPageHtml,
    htmlSnapshot,
    collectedAt,
    LINKEDIN_FOLLOWERS_PAGE_URL
  );
}
