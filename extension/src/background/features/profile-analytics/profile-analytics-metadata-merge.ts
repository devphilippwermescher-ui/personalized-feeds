import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';

export interface ProfileMetadataObservedFields {
  headline: boolean;
  profileImageUrl: boolean;
  backgroundImageUrl: boolean;
}

export function getProfileMetadataValues(profile: ProfileAnalyticsProfileSnapshot) {
  return {
    linkedinUrl: profile.linkedinUrl,
    linkedinUsername: profile.linkedinUsername,
    profileUrn: profile.profileUrn,
    memberNumericId: profile.memberNumericId,
    displayName: profile.displayName,
    headline: profile.headline,
    profileImageUrl: profile.profileImageUrl,
    backgroundImageUrl: profile.backgroundImageUrl,
    company: profile.company,
    location: profile.location,
  };
}

export function mergeProfileMetadataSnapshot(
  current: ProfileAnalyticsProfileSnapshot,
  metadata: ProfileAnalyticsProfileSnapshot,
  observed: ProfileMetadataObservedFields,
  collectedAt: number
): ProfileAnalyticsProfileSnapshot {
  return {
    ...current,
    linkedinUrl: metadata.linkedinUrl || current.linkedinUrl,
    linkedinUsername: metadata.linkedinUsername || current.linkedinUsername,
    profileUrn: metadata.profileUrn || current.profileUrn,
    memberNumericId: metadata.memberNumericId || current.memberNumericId,
    displayName: metadata.displayName || current.displayName,
    ...(observed.headline ? { headline: metadata.headline || '' } : { headline: current.headline }),
    ...(observed.profileImageUrl ? { profileImageUrl: metadata.profileImageUrl || '' } : {}),
    ...(observed.backgroundImageUrl ? { backgroundImageUrl: metadata.backgroundImageUrl || '' } : {}),
    company: metadata.company || current.company,
    location: metadata.location || current.location,
    updatedAt: collectedAt,
    sourceUrl: metadata.sourceUrl,
  };
}
