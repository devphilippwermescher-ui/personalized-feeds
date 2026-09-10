import { upsertProfileAnalyticsSnapshot } from 'shared/firestore-service';
import type { ProfileAnalyticsSnapshot } from 'shared/types';
import { fetchLinkedInProfileMetadataSnapshot } from './profile-analytics-metadata-api';
import { getProfileMetadataValues, mergeProfileMetadataSnapshot } from './profile-analytics-metadata-merge';

export async function syncProfileMetadata({
  userId,
  linkedInTabId,
  currentSnapshot,
  collectedAt = Date.now(),
}: {
  userId: string;
  linkedInTabId?: number;
  currentSnapshot: ProfileAnalyticsSnapshot;
  collectedAt?: number;
}): Promise<{ snapshot: ProfileAnalyticsSnapshot; changed: boolean; sourceUrls: string[] }> {
  if (!currentSnapshot.profile) {
    throw new Error('Profile Analytics bootstrap is required before profile metadata can be synchronized.');
  }

  const result = await fetchLinkedInProfileMetadataSnapshot(collectedAt, linkedInTabId);
  if (!result) throw new Error('LinkedIn did not return profile metadata.');

  const profile = mergeProfileMetadataSnapshot(currentSnapshot.profile, result.profile, result.observed, collectedAt);
  const changed =
    JSON.stringify(getProfileMetadataValues(currentSnapshot.profile)) !==
    JSON.stringify(getProfileMetadataValues(profile));
  const snapshot = changed
    ? await upsertProfileAnalyticsSnapshot(userId, { profile }, { updatedAt: collectedAt })
    : currentSnapshot;

  console.info('[profile-analytics] metadata-only sync finished', {
    linkedInTabId,
    changed,
    displayName: profile.displayName,
    location: profile.location,
    hasAvatar: Boolean(profile.profileImageUrl),
    hasBackground: Boolean(profile.backgroundImageUrl),
    sourceUrls: result.sourceUrls,
  });
  return { snapshot, changed, sourceUrls: result.sourceUrls };
}
