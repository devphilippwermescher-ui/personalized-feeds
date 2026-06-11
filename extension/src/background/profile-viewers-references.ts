export interface ProfileViewerReference {
  linkedinUsername: string;
  linkedinUrl: string;
  index: number;
}

function addReference(
  references: ProfileViewerReference[],
  seenUsernames: Set<string>,
  rawUsername: string,
  index: number
): void {
  let linkedinUsername = '';
  try {
    linkedinUsername = decodeURIComponent(rawUsername).trim().toLowerCase();
  } catch {
    linkedinUsername = rawUsername.trim().toLowerCase();
  }

  if (!linkedinUsername || seenUsernames.has(linkedinUsername)) {
    return;
  }

  seenUsernames.add(linkedinUsername);
  references.push({
    linkedinUsername,
    linkedinUrl: `https://www.linkedin.com/in/${encodeURIComponent(linkedinUsername)}/`,
    index,
  });
}

export function extractProfileViewerReferences(payload: string): ProfileViewerReference[] {
  const references: ProfileViewerReference[] = [];
  const seenUsernames = new Set<string>();
  const profilePathPattern = /(?:https:\/\/www\.linkedin\.com)?\/in\/([a-z0-9%_.~-]+)/gi;
  const connectStatePattern = /connect-button-disabled-([a-z0-9][a-z0-9-]{2,})/gi;

  let match: RegExpExecArray | null;
  while ((match = profilePathPattern.exec(payload))) {
    addReference(references, seenUsernames, match[1], match.index);
  }

  while ((match = connectStatePattern.exec(payload))) {
    addReference(references, seenUsernames, match[1], match.index);
  }

  return references.sort((a, b) => a.index - b.index);
}
