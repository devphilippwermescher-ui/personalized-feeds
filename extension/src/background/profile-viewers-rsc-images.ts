import { parseProfileViewerCardsFromRsc } from './features/profile-viewers/parsers/rsc-card-parser';

/** Compatibility facade that exposes only images proven inside one card. */
export function extractProfileViewerImageUrls(payload: string): Map<string, string> {
  return new Map(
    parseProfileViewerCardsFromRsc(payload)
      .filter((viewer) => Boolean(viewer.profileImageUrl))
      .map((viewer) => [viewer.displayName.trim().toLowerCase(), viewer.profileImageUrl || ''])
  );
}
