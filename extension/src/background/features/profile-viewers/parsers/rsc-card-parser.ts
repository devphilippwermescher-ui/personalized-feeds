import { humanizeLinkedInUsername } from 'shared/profile-viewer-quality';
import type { ProfileViewerInput } from 'shared/types';
import {
  buildProfileViewerRscTrees,
  normalizeRscCardText,
  type ProfileOccurrence,
  type RscTreeNode,
} from './rsc-card-graph';

interface CardContext {
  node: RscTreeNode;
  viewer: ProfileViewerInput;
  firstOccurrenceOrder: number;
}

function isTechnicalString(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    value.length > 220 ||
    /^\$L?[\da-f]+(?::.*)?$/i.test(value) ||
    /^(offsetstart|offsetend|start|end|length|text|attributes|entityurn|navigationurl)$/i.test(value) ||
    /^(?:true|false|null|-?\d+(?:\.\d+)?)$/i.test(value) ||
    /^https?:\/\//i.test(value) ||
    lower.includes('linkedin.com') ||
    lower.includes('urn:li:') ||
    lower.includes('proto.') ||
    lower.includes('profileview') ||
    lower.includes('wvmp') ||
    lower.includes('tracking') ||
    lower.includes('profile-displayphoto') ||
    lower.includes('profile-framedphoto')
  );
}

function isUiText(value: string): boolean {
  return /^(connect|message|follow|view profile|[•\u2022]?\s*(?:1st|2nd|3rd|\d+th))$/i.test(value);
}

function isLikelyDisplayName(value: string): boolean {
  if (
    value.length > 90 ||
    isTechnicalString(value) ||
    isUiText(value) ||
    /viewed\s+.+?\sago/i.test(value) ||
    /\d+\s+mutual\s+connections?/i.test(value) ||
    /^(?:send a message to|invite|following, click|pending, click|sorry, unable|sort by)\b/i.test(value) ||
    /[|@]/.test(value)
  ) {
    return false;
  }
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 6 && /\p{L}/u.test(value);
}

function getMeaningfulSlugParts(linkedinUsername: string): string[] {
  return linkedinUsername.split(/[-_]+/).filter((part) => part.length > 2 && !/^\d+$/.test(part));
}

function scoreSlugMatch(value: string, linkedinUsername: string): number {
  const lower = value.toLowerCase();
  return getMeaningfulSlugParts(linkedinUsername).reduce(
    (score, part) => score + (lower.includes(part.toLowerCase()) ? 1 : 0),
    0
  );
}

function pickDisplayName(node: RscTreeNode, linkedinUsername: string): string {
  const labelCandidates = node.labelStrings
    .filter(isLikelyDisplayName)
    .filter((value, index, values) => values.indexOf(value) === index);
  const candidates = (labelCandidates.length > 0 ? labelCandidates : node.strings)
    .filter(isLikelyDisplayName)
    .filter((value, index, values) => values.indexOf(value) === index);
  return (
    [...candidates].sort((left, right) => {
      const scoreDifference = scoreSlugMatch(right, linkedinUsername) - scoreSlugMatch(left, linkedinUsername);
      return scoreDifference || left.length - right.length;
    })[0] || ''
  );
}

function isLikelyHeadline(value: string, displayName: string, linkedinUsername: string): boolean {
  return Boolean(
    value !== displayName &&
      value.length >= 4 &&
      !isTechnicalString(value) &&
      !isUiText(value) &&
      !/viewed\s+.+?\sago/i.test(value) &&
      !/\d+\s+mutual\s+connections?/i.test(value) &&
      scoreSlugMatch(value, linkedinUsername) < 2 &&
      /\p{L}/u.test(value) &&
      (/\s|[|/\\,.-]/.test(value) || value.length > 10 || /^(?:recruiter|developer|designer|founder|student|manager|consultant|engineer)$/i.test(value))
  );
}

function pickHeadline(node: RscTreeNode, displayName: string, linkedinUsername: string): string {
  const displayNameIndex = node.strings.findIndex((value) => value === displayName);
  const candidates = displayNameIndex >= 0 ? node.strings.slice(displayNameIndex + 1) : node.strings;
  return candidates.find((value) => isLikelyHeadline(value, displayName, linkedinUsername)) || '';
}

function extractViewedAgoText(strings: string[]): string {
  for (const value of strings) {
    const viewedMatch = value.match(/Viewed\s+[^"'<\\]{1,80}?\sago/i);
    if (viewedMatch) {
      return normalizeRscCardText(viewedMatch[0]);
    }
  }
  return '';
}

function hasCardEvidence(node: RscTreeNode): boolean {
  return Boolean(extractViewedAgoText(node.strings) || node.verticalPositions.length > 0);
}

function contextContainsOnlyUsername(node: RscTreeNode, linkedinUsername: string): boolean {
  return node.usernames.size === 1 && node.usernames.has(linkedinUsername);
}

function isMultiProfileCardContext(node: RscTreeNode, linkedinUsername: string): boolean {
  if (node.usernames.size <= 1 || !pickDisplayName(node, linkedinUsername)) return false;
  const semanticPositions = new Set(node.verticalPositions);
  const viewedLabels = node.strings.filter((value) => /Viewed\s+.+?\sago/i.test(value));
  return semanticPositions.size === 1 || viewedLabels.length === 1;
}

function findContainingMultiProfileCard(occurrence: ProfileOccurrence): RscTreeNode | null {
  const candidates: RscTreeNode[] = [];
  let node = occurrence.node?.parent;
  while (node) {
    if (isMultiProfileCardContext(node, occurrence.linkedinUsername)) candidates.push(node);
    node = node.parent;
  }
  return candidates.sort((left, right) => left.nodeCount - right.nodeCount)[0] || null;
}

function findSmallestCardContext(occurrence: ProfileOccurrence): RscTreeNode {
  const multiProfileCard = findContainingMultiProfileCard(occurrence);
  if (multiProfileCard) return multiProfileCard;

  const ancestors: RscTreeNode[] = [];
  let node = occurrence.node;
  while (node && contextContainsOnlyUsername(node, occurrence.linkedinUsername)) {
    ancestors.push(node);
    node = node.parent;
  }

  const reliableContexts = ancestors.filter(
    (candidate) => hasCardEvidence(candidate) && Boolean(pickDisplayName(candidate, occurrence.linkedinUsername))
  );
  return [...(reliableContexts.length > 0 ? reliableContexts : ancestors)].sort(
    (left, right) => left.nodeCount - right.nodeCount
  )[0];
}

function buildViewer(node: RscTreeNode, occurrence: ProfileOccurrence): ProfileViewerInput {
  const parsedDisplayName = pickDisplayName(node, occurrence.linkedinUsername);
  const meaningfulSlugParts = getMeaningfulSlugParts(occurrence.linkedinUsername);
  const trustedCardContext = hasCardEvidence(node) && Boolean(parsedDisplayName);
  const parsedIdentityConflicts =
    meaningfulSlugParts.length >= 2 &&
    scoreSlugMatch(parsedDisplayName, occurrence.linkedinUsername) === 0;
  const displayName =
    parsedDisplayName && !parsedIdentityConflicts
      ? parsedDisplayName
      : humanizeLinkedInUsername(occurrence.linkedinUsername);
  const identityUncertain =
    !trustedCardContext ||
    parsedIdentityConflicts ||
    /^aco[a-z0-9_-]{8,}$/i.test(occurrence.linkedinUsername) ||
    meaningfulSlugParts.length < 2;
  const retainCardFields = trustedCardContext && !parsedIdentityConflicts;
  const matchingImage = node.imageCandidates.find(
    (candidate) => candidate.a11yText === parsedDisplayName.toLowerCase()
  );
  const viewedAgoText = extractViewedAgoText(node.strings);
  const mutualConnectionsText =
    node.strings.map((value) => value.match(/\d+\s+mutual\s+connections?/i)?.[0] || '').find(Boolean) || '';
  const connectionDegree =
    node.strings
      .map((value) => value.match(/(?:^|[•\u2022]\s*)(1st|2nd|3rd|\d+th)$/i)?.[1] || '')
      .find(Boolean) || '';

  return {
    linkedinUsername: occurrence.linkedinUsername,
    linkedinUrl: occurrence.linkedinUrl,
    displayName,
    headline: retainCardFields
      ? pickHeadline(node, parsedDisplayName, occurrence.linkedinUsername)
      : '',
    profileImageUrl: identityUncertain || !retainCardFields ? '' : matchingImage?.url || '',
    connectionDegree: retainCardFields ? connectionDegree : '',
    viewedAgoText: retainCardFields ? viewedAgoText : '',
    mutualConnectionsText: retainCardFields ? mutualConnectionsText : '',
    isPremium: retainCardFields && node.hasPremiumSignal ? true : undefined,
    identityUncertain,
    sourceIndex: occurrence.renderOrder,
    renderPosition:
      node.verticalPositions.length > 0 ? Math.min(...node.verticalPositions) : undefined,
  };
}

function parseRscTrees(roots: RscTreeNode[]): ProfileViewerInput[] {
  const occurrences = roots.flatMap((root) => root.occurrences);
  const contextsByNode = new Map<RscTreeNode, CardContext>();

  occurrences.forEach((occurrence) => {
    const multiProfileCard = findContainingMultiProfileCard(occurrence);
    if (
      multiProfileCard &&
      multiProfileCard.occurrences[0]?.linkedinUsername !== occurrence.linkedinUsername
    ) {
      return;
    }
    const node = findSmallestCardContext(occurrence);
    const existing = contextsByNode.get(node);
    if (existing) {
      existing.firstOccurrenceOrder = Math.min(existing.firstOccurrenceOrder, occurrence.renderOrder);
      return;
    }
    contextsByNode.set(node, {
      node,
      viewer: buildViewer(node, occurrence),
      firstOccurrenceOrder: occurrence.renderOrder,
    });
  });

  return [...contextsByNode.values()]
    .sort((left, right) => left.firstOccurrenceOrder - right.firstOccurrenceOrder)
    .map((context, sourceIndex) => ({
      ...context.viewer,
      sourceIndex,
    }));
}

/**
 * Reads rendered Profile Visitor cards from the React Flight record graph.
 * Definitions are expanded only through references reached by the rendered
 * root, and fields are accepted only from the smallest single-profile parent.
 */
export function parseProfileViewerCardsFromRsc(payload: string): ProfileViewerInput[] {
  return parseRscTrees(buildProfileViewerRscTrees(payload));
}
