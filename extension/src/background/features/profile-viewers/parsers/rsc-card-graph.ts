import { isValidLinkedInProfileUsername } from 'shared/linkedin-identity';
import { isUsableLinkedInProfileImageUrl } from 'shared/profile-viewer-quality';
import { parseOrderedRscFlightRecords } from '../../../../linkedin/rsc-flight-records';
import { hasExplicitProfileViewerPremiumSignal } from '../../../profile-viewers-premium';

export interface ProfileOccurrence {
  linkedinUsername: string;
  linkedinUrl: string;
  renderOrder: number;
  node?: RscTreeNode;
}

export interface RscTreeNode {
  parent?: RscTreeNode;
  children: RscTreeNode[];
  occurrences: ProfileOccurrence[];
  usernames: Set<string>;
  strings: string[];
  labelStrings: string[];
  verticalPositions: number[];
  imageCandidates: Array<{ a11yText: string; url: string }>;
  hasPremiumSignal: boolean;
  nodeCount: number;
}

const PROFILE_PATH_PATTERN = /(?:https:\/\/www\.linkedin\.com)?\/in\/([\p{L}\p{N}%_.~-]+)/giu;
const RECORD_REFERENCE_PATTERN = /^\$L?([\da-f]+)(?::.*)?$/i;

export function normalizeRscCardText(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u002D/gi, '-')
    .replace(/\\u200b|\u200b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeProfile(rawUsername: string): Pick<ProfileOccurrence, 'linkedinUsername' | 'linkedinUrl'> | null {
  let linkedinUsername = '';
  try {
    linkedinUsername = decodeURIComponent(rawUsername).trim().toLowerCase();
  } catch {
    linkedinUsername = rawUsername.trim().toLowerCase();
  }
  if (!isValidLinkedInProfileUsername(linkedinUsername)) {
    return null;
  }
  return {
    linkedinUsername,
    linkedinUrl: `https://www.linkedin.com/in/${encodeURIComponent(linkedinUsername)}/`,
  };
}

function extractEmbeddedRscPayloads(payload: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const addCandidate = (value: unknown): void => {
    if (typeof value === 'string' && !seen.has(value)) {
      seen.add(value);
      candidates.push(value);
    }
  };
  const parseEnvelope = (value: string): void => {
    try {
      addCandidate((JSON.parse(value) as { data?: unknown })?.data);
    } catch {
      // A raw React Flight response is not wrapped in JSON.
    }
  };

  parseEnvelope(payload);
  payload.split(/\r?\n/).forEach((line) => {
    const eventData = line.match(/^data:\s*(.+)$/)?.[1];
    if (eventData) parseEnvelope(eventData);
  });
  addCandidate(payload);
  return candidates;
}

function extractImageCandidate(value: Record<string, unknown>): { a11yText: string; url: string } | null {
  const renderPayload = value.renderPayload;
  if (!renderPayload || typeof renderPayload !== 'object') return null;

  const image = renderPayload as Record<string, unknown>;
  const rootUrl = typeof image.rootUrl === 'string' ? normalizeRscCardText(image.rootUrl) : '';
  const renditions = Array.isArray(image.imageRenditions) ? image.imageRenditions : [];
  const preferredRendition = renditions
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .sort(
      (left, right) =>
        Math.abs((Number(left.width) || 0) - 100) - Math.abs((Number(right.width) || 0) - 100)
    )[0];
  const suffixUrl =
    typeof preferredRendition?.suffixUrl === 'string'
      ? normalizeRscCardText(preferredRendition.suffixUrl)
      : '';
  const url = `${rootUrl}${suffixUrl}`;
  return isUsableLinkedInProfileImageUrl(url)
    ? {
        a11yText:
          typeof value.a11yText === 'string'
            ? normalizeRscCardText(value.a11yText).toLowerCase()
            : '',
        url,
      }
    : null;
}

function createTreeNode(
  value: unknown,
  parent: RscTreeNode | undefined,
  activeRecordIds: Set<string>,
  records: Map<string, unknown>,
  nextRenderOrder: { value: number }
): RscTreeNode {
  const node: RscTreeNode = {
    parent,
    children: [],
    occurrences: [],
    usernames: new Set<string>(),
    strings: [],
    labelStrings: [],
    verticalPositions: [],
    imageCandidates: [],
    hasPremiumSignal: false,
    nodeCount: 1,
  };
  const recordId =
    typeof value === 'string'
      ? value.match(RECORD_REFERENCE_PATTERN)?.[1]?.toLowerCase() || null
      : null;

  if (recordId && records.has(recordId) && !activeRecordIds.has(recordId)) {
    const nextActiveRecordIds = new Set(activeRecordIds);
    nextActiveRecordIds.add(recordId);
    node.children.push(
      createTreeNode(records.get(recordId), node, nextActiveRecordIds, records, nextRenderOrder)
    );
  } else if (typeof value === 'string' && !recordId) {
    const normalized = normalizeRscCardText(value);
    if (normalized) node.strings.push(normalized);

    let match: RegExpExecArray | null;
    PROFILE_PATH_PATTERN.lastIndex = 0;
    while ((match = PROFILE_PATH_PATTERN.exec(normalized))) {
      const profile = normalizeProfile(match[1]);
      if (!profile) continue;
      node.occurrences.push({ ...profile, renderOrder: nextRenderOrder.value, node });
      nextRenderOrder.value += 1;
    }
  } else if (Array.isArray(value)) {
    const childValues = value[0] === '$' ? value.slice(3) : value;
    childValues.forEach((childValue) => {
      node.children.push(
        createTreeNode(childValue, node, activeRecordIds, records, nextRenderOrder)
      );
    });
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const imageCandidate = extractImageCandidate(record);
    if (imageCandidate) node.imageCandidates.push(imageCandidate);
    node.hasPremiumSignal = hasExplicitProfileViewerPremiumSignal(JSON.stringify(record));

    Object.entries(record).forEach(([key, childValue]) => {
      if (key === 'verticalPosition' && Number.isSafeInteger(childValue) && Number(childValue) >= 0) {
        node.verticalPositions.push(Number(childValue));
      }
      if (['a11yText', 'alt', 'aria-label'].includes(key) && typeof childValue === 'string') {
        const label = normalizeRscCardText(childValue);
        if (label) node.labelStrings.push(label);
      }
      node.children.push(
        createTreeNode(childValue, node, activeRecordIds, records, nextRenderOrder)
      );
    });
  }

  node.children.forEach((child) => {
    node.occurrences.push(...child.occurrences);
    child.usernames.forEach((username) => node.usernames.add(username));
    node.strings.push(...child.strings);
    node.labelStrings.push(...child.labelStrings);
    node.verticalPositions.push(...child.verticalPositions);
    node.imageCandidates.push(...child.imageCandidates);
    node.hasPremiumSignal ||= child.hasPremiumSignal;
    node.nodeCount += child.nodeCount;
  });
  node.occurrences.forEach((occurrence) => node.usernames.add(occurrence.linkedinUsername));
  return node;
}

export function buildProfileViewerRscTrees(payload: string): RscTreeNode[] {
  for (const candidate of extractEmbeddedRscPayloads(payload)) {
    const orderedRecords = parseOrderedRscFlightRecords(candidate);
    if (orderedRecords.length === 0) continue;

    const records = new Map(orderedRecords.map((record) => [record.id, record.value]));
    const rootRecords = records.has('0')
      ? [{ id: '0', value: records.get('0') }]
      : orderedRecords;
    const nextRenderOrder = { value: 0 };
    const roots = rootRecords.map((record) =>
      createTreeNode(
        record.value,
        undefined,
        new Set([record.id]),
        records,
        nextRenderOrder
      )
    );
    if (roots.some((root) => root.occurrences.length > 0)) return roots;
  }
  return [];
}
