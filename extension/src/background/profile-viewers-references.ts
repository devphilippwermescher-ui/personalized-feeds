import { isValidLinkedInProfileUsername } from 'shared/linkedin-identity';

export interface ProfileViewerReference {
  linkedinUsername: string;
  linkedinUrl: string;
  index: number;
}

interface RscRecord {
  value: unknown;
  sourceIndex: number;
}

function collectEmbeddedRscPayloads(payload: string): string[] {
  const embeddedCandidates: string[] = [];
  const seen = new Set([payload]);
  const addCandidate = (value: unknown): void => {
    if (typeof value !== 'string' || !value.includes(':') || seen.has(value)) {
      return;
    }
    seen.add(value);
    embeddedCandidates.push(value);
  };

  const parseEnvelope = (value: string): void => {
    try {
      const parsed = JSON.parse(value) as { data?: unknown };
      addCandidate(parsed?.data);
    } catch {
      /* Not every RSC response is wrapped in an SSE JSON envelope. */
    }
  };

  parseEnvelope(payload);
  payload.split(/\r?\n/).forEach((line) => {
    const eventData = line.match(/^data:\s*(.+)$/)?.[1];
    if (eventData) {
      parseEnvelope(eventData);
    }
  });

  // Prefer decoded event data. Treating the outer `data: {...}` envelope as
  // an RSC record would preserve serialized definition order by accident.
  return [...embeddedCandidates, payload];
}

function parseRscRecords(payload: string): Map<string, RscRecord> {
  const records = new Map<string, RscRecord>();
  const recordPattern = /(?:^|\n)([\da-z]+):([^\n]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = recordPattern.exec(payload))) {
    try {
      records.set(match[1].toLowerCase(), {
        value: JSON.parse(match[2]),
        sourceIndex: match.index,
      });
    } catch {
      /* Import records such as `3:I[...]` are not renderable data nodes. */
    }
  }

  return records;
}

function extractRenderedProfileUsernames(payload: string): string[] {
  const records = parseRscRecords(payload);
  if (records.size === 0) {
    return [];
  }

  const usernames: string[] = [];
  const seenUsernames = new Set<string>();
  const activeRecords = new Set<string>();
  const addRawUsername = (rawUsername: string): void => {
    let username = '';
    try {
      username = decodeURIComponent(rawUsername).trim().toLowerCase();
    } catch {
      username = rawUsername.trim().toLowerCase();
    }
    if (!isValidLinkedInProfileUsername(username) || seenUsernames.has(username)) {
      return;
    }
    seenUsernames.add(username);
    usernames.push(username);
  };

  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      const recordReference = value.match(/^\$L?([\da-z]+)(?::.*)?$/i)?.[1]?.toLowerCase();
      if (recordReference && records.has(recordReference) && !activeRecords.has(recordReference)) {
        activeRecords.add(recordReference);
        visit(records.get(recordReference)?.value);
        activeRecords.delete(recordReference);
        return;
      }

      const profilePathPattern = /(?:https:\/\/www\.linkedin\.com)?\/in\/([\p{L}\p{N}%_.~-]+)/giu;
      const connectStatePattern = /connect-button-disabled-([\p{L}\p{N}][\p{L}\p{N}-]{2,})/giu;
      let match: RegExpExecArray | null;
      while ((match = profilePathPattern.exec(value))) {
        addRawUsername(match[1]);
      }
      while ((match = connectStatePattern.exec(value))) {
        addRawUsername(match[1]);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };

  const root = records.get('0');
  if (root) {
    visit(root.value);
  } else {
    Array.from(records.values())
      .sort((left, right) => left.sourceIndex - right.sourceIndex)
      .forEach((record) => visit(record.value));
  }

  return usernames;
}

function getRenderedProfileUsernameOrder(payload: string): string[] {
  for (const candidate of collectEmbeddedRscPayloads(payload)) {
    const usernames = extractRenderedProfileUsernames(candidate);
    if (usernames.length > 0) {
      return usernames;
    }
  }
  return [];
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

  if (!isValidLinkedInProfileUsername(linkedinUsername) || seenUsernames.has(linkedinUsername)) {
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
  const profilePathPattern = /(?:https:\/\/www\.linkedin\.com)?\/in\/([\p{L}\p{N}%_.~-]+)/giu;
  const connectStatePattern = /connect-button-disabled-([\p{L}\p{N}][\p{L}\p{N}-]{2,})/giu;

  let match: RegExpExecArray | null;
  while ((match = profilePathPattern.exec(payload))) {
    addReference(references, seenUsernames, match[1], match.index);
  }

  while ((match = connectStatePattern.exec(payload))) {
    addReference(references, seenUsernames, match[1], match.index);
  }

  const sourceOrderedReferences = references.sort((a, b) => a.index - b.index);
  const renderedUsernames = getRenderedProfileUsernameOrder(payload);
  if (renderedUsernames.length === 0) {
    return sourceOrderedReferences;
  }

  const renderedPosition = new Map(renderedUsernames.map((username, index) => [username, index]));
  return [...sourceOrderedReferences].sort((left, right) => {
    const leftPosition = renderedPosition.get(left.linkedinUsername);
    const rightPosition = renderedPosition.get(right.linkedinUsername);
    if (leftPosition !== undefined && rightPosition !== undefined) {
      return leftPosition - rightPosition;
    }
    if (leftPosition !== undefined) {
      return -1;
    }
    if (rightPosition !== undefined) {
      return 1;
    }
    return left.index - right.index;
  });
}
