import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';
import {
  chooseVectorImageUrl,
  compactJoin,
  findFirstNumberByKeyPriority,
  findFirstRecord,
  findFirstStringByKey,
  findIncludedEntity,
  getNestedRecord,
  getString,
  isRecord,
  type UnknownRecord,
} from './linkedin/json-utils';

export function extractMiniProfile(payload: unknown): UnknownRecord | null {
  if (!isRecord(payload)) return null;
  const referencedUrn = getString(getNestedRecord(payload, ['data'])?.['*miniProfile']);
  return (
    findIncludedEntity(payload, referencedUrn) ||
    getNestedRecord(payload, ['miniProfile']) ||
    findFirstRecord(payload.included, (record) => getString(record.publicIdentifier) !== '') ||
    findFirstRecord(payload, (record) => getString(record.publicIdentifier) !== '')
  );
}

export function profileSnapshotFromMiniProfile(
  miniProfile: UnknownRecord,
  collectedAt: number,
  sourceUrl: string
): ProfileAnalyticsProfileSnapshot | null {
  const linkedinUsername = getString(miniProfile.publicIdentifier);
  if (!linkedinUsername) return null;

  const displayName =
    `${getString(miniProfile.firstName)} ${getString(miniProfile.lastName)}`.trim() || getString(miniProfile.name);
  if (!displayName) return null;

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

export function profileSnapshotFromProfileView(
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
  const geoLocation = isRecord(profile.geoLocation) ? profile.geoLocation : undefined;
  const geoReference = getString(geoLocation?.['*geo']) || getString(profile['*geoLocation']);
  const geoEntity = findIncludedEntity(payload, geoReference);
  const city =
    getString(profile.geoLocationName) ||
    getString(profile.locationName) ||
    getString(geoLocation?.defaultLocalizedName) ||
    getString(getNestedRecord(geoLocation || {}, ['geo'])?.defaultLocalizedName) ||
    getString(geoEntity?.defaultLocalizedName) ||
    findFirstStringByKey(payload, /^(?:geoLocationName|locationName)$/i);
  const country = getString(profile.geoCountryName) || findFirstStringByKey(payload, /^geoCountryName$/i);
  const location =
    city && country && city.toLocaleLowerCase().includes(country.toLocaleLowerCase())
      ? city
      : compactJoin([city, country]);

  return {
    ...fallback,
    profileUrn: getString(profile.entityUrn) || fallback.profileUrn,
    displayName,
    headline: getString(profile.headline) || getString(miniProfile?.occupation) || fallback.headline,
    profileImageUrl:
      chooseVectorImageUrl(profile.picture) || chooseVectorImageUrl(miniProfile?.picture) || fallback.profileImageUrl,
    backgroundImageUrl:
      chooseVectorImageUrl(profile.backgroundImage) ||
      chooseVectorImageUrl(miniProfile?.backgroundImage) ||
      fallback.backgroundImageUrl,
    location: location || getString(profile.location) || fallback.location,
    updatedAt: collectedAt,
    sourceUrl,
  };
}

export function extractConnectionsCountFromNetworkInfo(payload: unknown): number | undefined {
  return findFirstNumberByKeyPriority(payload, [
    /^firstDegreeSize$/i,
    /^memberConnectionsCount$/i,
    /^numberOfConnections$/i,
    /^connectionsCount$/i,
    /^connectionCount$/i,
    /^numConnections$/i,
  ]);
}

export function extractFollowersCountFromNetworkInfo(payload: unknown): number | undefined {
  return findFirstNumberByKeyPriority(payload, [
    /^followerSize$/i,
    /^memberFollowersCount$/i,
    /^numberOfFollowers$/i,
    /^followersCount$/i,
    /^followerCount$/i,
  ]);
}

export function profileSnapshotFromNetworkInfo(
  payload: unknown,
  fallback: ProfileAnalyticsProfileSnapshot,
  collectedAt: number,
  sourceUrl: string
): ProfileAnalyticsProfileSnapshot {
  const city = findFirstStringByKey(payload, /^(?:geoLocationName|locationName)$/i);
  const country = findFirstStringByKey(payload, /^geoCountryName$/i);
  return {
    ...fallback,
    location: compactJoin([city, country]) || fallback.location,
    connectionsCount: extractConnectionsCountFromNetworkInfo(payload),
    followersCount: extractFollowersCountFromNetworkInfo(payload),
    updatedAt: collectedAt,
    sourceUrl,
  };
}

export function extractFollowersCountFromGraphql(payload: unknown): number | undefined {
  if (!isRecord(payload)) return undefined;
  const followersSearch = getNestedRecord(payload, ['data', 'data', 'searchDashClustersByAll']);
  if (!followersSearch) return undefined;

  return findFirstNumberByKeyPriority(followersSearch, [
    /^totalResultCount$/i,
    /^totalResults?$/i,
    /^totalFollowersCount$/i,
    /^total$/i,
  ]);
}
