import { parseProfileViewerCardsFromRsc } from './features/profile-viewers/parsers/rsc-card-parser';

export interface ProfileViewerReference {
  linkedinUsername: string;
  linkedinUrl: string;
  index: number;
}

/** Compatibility facade over the card-local RSC graph parser. */
export function extractProfileViewerReferences(payload: string): ProfileViewerReference[] {
  return parseProfileViewerCardsFromRsc(payload).map((viewer, index) => ({
    linkedinUsername: viewer.linkedinUsername,
    linkedinUrl: viewer.linkedinUrl,
    index: viewer.sourceIndex ?? index,
  }));
}
