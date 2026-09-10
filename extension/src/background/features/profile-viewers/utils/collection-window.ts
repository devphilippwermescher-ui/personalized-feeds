import { isPersistableProfileViewerIdentity } from 'shared/linkedin-identity';
import type { ProfileViewerInput } from 'shared/types';
import { mergeProfileViewerCandidates } from '../profile-viewers-parser-merge';

export interface ProfileViewerCollectionWindow {
  rankedViewers: ProfileViewerInput[];
  pageViewers: ProfileViewerInput[];
}

/** Applies product limits only after canonical order and identity validation. */
export function selectProfileViewerCollectionWindow(
  collectedViewers: ProfileViewerInput[],
  enrichedPageViewers: ProfileViewerInput[],
  visibleViewerLimit: number | undefined
): ProfileViewerCollectionWindow {
  const verifiedPageViewers = mergeProfileViewerCandidates([
    enrichedPageViewers.filter(isPersistableProfileViewerIdentity),
  ]);
  const mergedViewers = mergeProfileViewerCandidates([
    collectedViewers,
    verifiedPageViewers,
  ]);
  const rankedViewers =
    typeof visibleViewerLimit === 'number'
      ? mergedViewers.slice(0, visibleViewerLimit)
      : mergedViewers;
  const allowedUsernames = new Set(
    rankedViewers.map((viewer) => viewer.linkedinUsername.toLowerCase())
  );

  return {
    rankedViewers,
    pageViewers: verifiedPageViewers.filter((viewer) =>
      allowedUsernames.has(viewer.linkedinUsername.toLowerCase())
    ),
  };
}
