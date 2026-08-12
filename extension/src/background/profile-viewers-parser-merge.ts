import type { ProfileViewerInput } from 'shared/types';
import { chooseProfileViewerDisplayName, chooseProfileViewerImageUrl } from 'shared/profile-viewer-quality';
import { isValidLinkedInProfileUsername } from 'shared/linkedin-identity';

const ENRICHABLE_FIELDS = [
  'headline',
  'connectionDegree',
  'viewedAgoText',
  'mutualConnectionsText',
] as const satisfies ReadonlyArray<keyof ProfileViewerInput>;

function mergeProfileViewer(existing: ProfileViewerInput, incoming: ProfileViewerInput): ProfileViewerInput {
  const preserveVerifiedExistingIdentity =
    existing.identityUncertain === false && incoming.identityUncertain === true;
  const identityUncertain =
    existing.identityUncertain === false || incoming.identityUncertain === false
      ? false
      : existing.identityUncertain === true || incoming.identityUncertain === true
        ? true
        : undefined;
  const merged = {
    ...existing,
    displayName: preserveVerifiedExistingIdentity
      ? existing.displayName
      : chooseProfileViewerDisplayName(incoming.displayName, existing.displayName, existing.linkedinUsername),
    profileImageUrl: preserveVerifiedExistingIdentity
      ? existing.profileImageUrl
      : chooseProfileViewerImageUrl(incoming.profileImageUrl, existing.profileImageUrl),
    isPremium: incoming.isPremium === true ? true : existing.isPremium,
    identityUncertain,
    discardExistingProfileImage:
      existing.discardExistingProfileImage === true ||
      incoming.discardExistingProfileImage === true ||
      undefined,
    sourceIndex:
      existing.sourceIndex === undefined
        ? incoming.sourceIndex
        : incoming.sourceIndex === undefined
          ? existing.sourceIndex
          : Math.min(existing.sourceIndex, incoming.sourceIndex),
  };

  ENRICHABLE_FIELDS.forEach((field) => {
    if (!String(merged[field] || '').trim() && String(incoming[field] || '').trim()) {
      merged[field] = incoming[field] as never;
    }
  });

  return merged;
}

export function mergeProfileViewerCandidates(candidateGroups: ProfileViewerInput[][]): ProfileViewerInput[] {
  const viewers: ProfileViewerInput[] = [];
  const viewerIndexes = new Map<string, number>();

  candidateGroups.forEach((candidates) => {
    candidates.forEach((candidate) => {
      const username = candidate.linkedinUsername.trim().toLowerCase();
      if (!isValidLinkedInProfileUsername(username)) {
        return;
      }

      const existingIndex = viewerIndexes.get(username);
      if (existingIndex !== undefined) {
        viewers[existingIndex] = mergeProfileViewer(viewers[existingIndex], candidate);
        return;
      }

      viewerIndexes.set(username, viewers.length);
      viewers.push(candidate);
    });
  });

  return viewers;
}
