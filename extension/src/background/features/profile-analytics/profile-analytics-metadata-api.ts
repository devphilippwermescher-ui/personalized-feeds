import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';
import { readLinkedInProfileMetadataFromExistingTab } from './api/profile-metadata-page-collector';
import { resolveLinkedInProfileIdentity } from '../../platform/linkedin/profile-identity-resolver';
import { fetchLinkedInJson, getProfileUrls, LINKEDIN_ME_URL } from './profile-analytics-linkedin-api';
import {
  extractMiniProfile,
  profileSnapshotFromMiniProfile,
  profileSnapshotFromProfileView,
} from './profile-analytics-linkedin-parser';
import { chooseVectorImageUrl, type UnknownRecord } from '../../platform/linkedin/json-utils';
import { getLinkedInCsrfToken } from '../../platform/linkedin/csrf-token';
import type { ProfileMetadataObservedFields } from './profile-analytics-metadata-merge';

export interface LinkedInProfileMetadataResult {
  profile: ProfileAnalyticsProfileSnapshot;
  observed: ProfileMetadataObservedFields;
  sourceUrls: string[];
}

function readImageField(record: UnknownRecord, key: 'picture' | 'backgroundImage') {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return { observed: false, value: undefined };
  }
  return { observed: true, value: chooseVectorImageUrl(record[key]) || '' };
}

function readHeadlineField(record: UnknownRecord) {
  if (!Object.prototype.hasOwnProperty.call(record, 'occupation')) {
    return { observed: false, value: undefined };
  }
  return { observed: true, value: typeof record.occupation === 'string' ? record.occupation.trim() : '' };
}

export async function fetchLinkedInProfileMetadataSnapshot(
  collectedAt: number,
  linkedInTabId?: number
): Promise<LinkedInProfileMetadataResult | null> {
  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) return null;

  const mePayload = await fetchLinkedInJson(LINKEDIN_ME_URL, csrfToken);
  const miniProfile = extractMiniProfile(mePayload);
  if (!miniProfile) return null;
  const meSnapshot = profileSnapshotFromMiniProfile(miniProfile, collectedAt, LINKEDIN_ME_URL);
  if (!meSnapshot) return null;

  const avatar = readImageField(miniProfile, 'picture');
  const background = readImageField(miniProfile, 'backgroundImage');
  const headline = readHeadlineField(miniProfile);
  const urls = getProfileUrls(meSnapshot.linkedinUsername);
  const currentProfilePayload = await fetchLinkedInJson(urls.profile, csrfToken).catch(() => null);
  const legacyProfilePayload = currentProfilePayload
    ? null
    : await fetchLinkedInJson(urls.profileView, csrfToken).catch(() => null);
  const profilePayload = currentProfilePayload || legacyProfilePayload;
  const profileSourceUrl = currentProfilePayload
    ? urls.profile
    : legacyProfilePayload
      ? urls.profileView
      : LINKEDIN_ME_URL;
  const apiProfile = profilePayload
    ? profileSnapshotFromProfileView(profilePayload, meSnapshot, collectedAt, profileSourceUrl)
    : meSnapshot;
  let profile = apiProfile;

  const [identity, pageSnapshot] = await Promise.all([
    apiProfile.location
      ? Promise.resolve(null)
      : resolveLinkedInProfileIdentity(meSnapshot.linkedinUsername).catch((error) => {
          console.info('[profile-analytics] metadata GraphQL location fallback was unavailable', {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }),
    readLinkedInProfileMetadataFromExistingTab(linkedInTabId, meSnapshot.linkedinUsername),
  ]);
  const location = apiProfile.location || identity?.location || pageSnapshot?.location;

  profile = {
    ...profile,
    profileUrn: identity?.profileUrn || profile.profileUrn,
    ...(location ? { location } : {}),
    ...(headline.observed ? { headline: headline.value } : {}),
    ...(avatar.observed ? { profileImageUrl: avatar.value } : {}),
    ...(background.observed ? { backgroundImageUrl: background.value } : {}),
    updatedAt: collectedAt,
    sourceUrl: profileSourceUrl,
  };

  console.info('[profile-analytics] profile metadata collected', {
    linkedInTabId,
    linkedinUsername: profile.linkedinUsername,
    hasDisplayName: Boolean(profile.displayName),
    hasHeadline: Boolean(profile.headline),
    location: profile.location,
    avatarObserved: avatar.observed,
    hasAvatar: Boolean(profile.profileImageUrl),
    backgroundObserved: background.observed,
    hasBackground: Boolean(profile.backgroundImageUrl),
    locationSource: apiProfile.location
      ? profileSourceUrl
      : identity?.location
        ? 'voyagerIdentityDashProfiles'
        : pageSnapshot?.location
          ? pageSnapshot.pageUrl
          : undefined,
  });

  return {
    profile,
    observed: {
      headline: headline.observed,
      profileImageUrl: avatar.observed,
      backgroundImageUrl: background.observed,
    },
    sourceUrls: Array.from(
      new Set([
        LINKEDIN_ME_URL,
        ...(profilePayload ? [profileSourceUrl] : []),
        ...(pageSnapshot ? [pageSnapshot.pageUrl] : []),
      ])
    ),
  };
}
