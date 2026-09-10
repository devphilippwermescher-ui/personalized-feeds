import type { ProfileViewer, ProfileViewerListItem } from 'shared/types';
import { getUsernameFromLinkedInUrl, normalizeLinkedInUsername } from 'shared/linkedin-identity';

export type ProfileViewerProfileItem = ProfileViewer;

function normalizeComparableName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isProfileViewerProfileItem(
  viewer: ProfileViewerListItem
): viewer is ProfileViewerProfileItem {
  return 'linkedinUsername' in viewer && typeof viewer.linkedinUsername === 'string';
}

function getIntendedUsername(
  viewerId: string,
  updates: Record<string, unknown>
): string {
  return (
    normalizeLinkedInUsername(String(updates.linkedinUsername || '')) ||
    normalizeLinkedInUsername(getUsernameFromLinkedInUrl(String(updates.linkedinUrl || ''))) ||
    normalizeLinkedInUsername(viewerId)
  );
}

export function findProfileViewerUpdateTargets(
  viewers: ProfileViewerListItem[],
  viewerId: string,
  updates: Record<string, unknown>
): ProfileViewerProfileItem[] {
  const intendedUsername = getIntendedUsername(viewerId, updates);
  const updateProfileUrn = String(updates.profileUrn || '').trim();
  const updateMemberNumericId = String(updates.memberNumericId || '').trim();
  const profileViewers = viewers.filter(isProfileViewerProfileItem);
  const targets = new Map<string, ProfileViewerProfileItem>();

  if (intendedUsername) {
    profileViewers
      .filter((viewer) => {
        const viewerUsername = normalizeLinkedInUsername(viewer.linkedinUsername || viewer.id);
        return (
          viewerUsername === intendedUsername ||
          Boolean(updateProfileUrn && viewer.profileUrn === updateProfileUrn) ||
          Boolean(updateMemberNumericId && viewer.memberNumericId === updateMemberNumericId)
        );
      })
      .forEach((viewer) => {
        targets.set(viewer.linkedinUsername || viewer.id, viewer);
      });

    return Array.from(targets.values());
  }

  if (updateProfileUrn || updateMemberNumericId) {
    profileViewers
      .filter((viewer) =>
        Boolean(updateProfileUrn && viewer.profileUrn === updateProfileUrn) ||
        Boolean(updateMemberNumericId && viewer.memberNumericId === updateMemberNumericId)
      )
      .forEach((viewer) => {
        targets.set(viewer.linkedinUsername || viewer.id, viewer);
      });

    return Array.from(targets.values());
  }

  const displayName = normalizeComparableName(updates.displayName);
  if (displayName) {
    profileViewers
      .filter((viewer) => normalizeComparableName(viewer.displayName) === displayName)
      .forEach((viewer) => {
        targets.set(viewer.linkedinUsername || viewer.id, viewer);
      });
  }

  return Array.from(targets.values());
}
