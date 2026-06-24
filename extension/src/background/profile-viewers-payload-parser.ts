import type { ProfileViewerInput } from 'shared/types';
import { isValidLinkedInProfileUsername } from 'shared/linkedin-identity';
import { chooseProfileViewerDisplayName, humanizeLinkedInUsername } from 'shared/profile-viewer-quality';
import { mergeProfileViewerCandidates } from './profile-viewers-parser-merge';
import { extractProfileViewerReferences } from './profile-viewers-references';
import { extractProfileViewerImageUrls } from './profile-viewers-rsc-images';

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLinkedInPayloadText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u002D/gi, '-')
    .replace(/\\u200b/gi, '');
}

function stripHtml(value: string): string {
  return normalizeText(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function getHtmlAttribute(html: string, attributeName: string): string {
  const escapedAttribute = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`\\b${escapedAttribute}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return normalizeText(match?.[2] || match?.[3] || match?.[4] || '');
}

function normalizeLinkedInProfileUrl(rawHref: string): { linkedinUrl: string; linkedinUsername: string } | null {
  try {
    const url = new URL(decodeHtmlEntities(rawHref), 'https://www.linkedin.com');
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      return null;
    }

    const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
    if (!match?.[1]) {
      return null;
    }

    const linkedinUsername = decodeURIComponent(match[1]).trim().toLowerCase();
    if (!isValidLinkedInProfileUsername(linkedinUsername)) {
      return null;
    }

    return {
      linkedinUsername,
      linkedinUrl: `https://www.linkedin.com/in/${encodeURIComponent(linkedinUsername)}/`,
    };
  } catch {
    return null;
  }
}

function extractProfileViewerFromAnchor(
  rawHref: string,
  anchorHtml: string,
  sourceIndex?: number
): ProfileViewerInput | null {
  const normalizedProfile = normalizeLinkedInProfileUrl(rawHref);
  if (!normalizedProfile) {
    return null;
  }

  const imageMatch = anchorHtml.match(/<img\b[^>]*>/i);
  const svgLabelMatch = anchorHtml.match(/<svg\b[^>]*\baria-label\s*=\s*("([^"]*)"|'([^']*)')/i);
  const displayName = normalizeText(
    (imageMatch ? getHtmlAttribute(imageMatch[0], 'alt') : '') ||
      svgLabelMatch?.[2] ||
      svgLabelMatch?.[3] ||
      ''
  );

  if (!displayName) {
    return null;
  }

  const text = stripHtml(anchorHtml);
  const viewedAgoText = normalizeText(text.match(/Viewed\s+[^.]*?\bago\b/i)?.[0] || '');
  const mutualConnectionsText = normalizeText(text.match(/\d+\s+mutual\s+connections?/i)?.[0] || '');
  const connectionDegree = normalizeText(text.match(/[•\u2022]\s*(1st|2nd|3rd|\d+th)/i)?.[1] || '');
  const profileImageUrl = imageMatch
    ? [
        getHtmlAttribute(imageMatch[0], 'src'),
        getHtmlAttribute(imageMatch[0], 'data-delayed-url'),
        getHtmlAttribute(imageMatch[0], 'data-src'),
        getHtmlAttribute(imageMatch[0], 'data-li-src'),
        getHtmlAttribute(imageMatch[0], 'srcset').split(/\s+/)[0] || '',
      ]
        .map((value) => normalizeLinkedInPayloadText(value))
        .find((value) => /^https:\/\/media\.licdn\.com\//i.test(value)) || ''
    : '';

  let headline = text;
  [displayName, viewedAgoText, mutualConnectionsText, 'Connect', 'Message', 'Follow'].forEach((part) => {
    if (part) {
      headline = headline.replace(part, ' ');
    }
  });
  headline = normalizeText(headline.replace(/[•\u2022]\s*(1st|2nd|3rd|\d+th)/gi, ' '));

  return {
    ...normalizedProfile,
    displayName,
    headline,
    profileImageUrl,
    connectionDegree,
    viewedAgoText,
    mutualConnectionsText,
    sourceIndex,
  };
}

export function parseVisibleProfileViewers(html: string): ProfileViewerInput[] {
  const viewers: ProfileViewerInput[] = [];
  const seenUsernames = new Set<string>();
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const href = match[2] || match[3] || match[4] || '';
    const viewer = extractProfileViewerFromAnchor(href, match[5] || '', match.index);
    if (!viewer || seenUsernames.has(viewer.linkedinUsername)) {
      continue;
    }

    seenUsernames.add(viewer.linkedinUsername);
    viewers.push(viewer);
  }

  return viewers;
}

function extractQuotedStrings(value: string): string[] {
  const strings: string[] = [];
  const seen = new Set<string>();
  const addString = (rawValue: string): void => {
    const normalized = normalizeText(normalizeLinkedInPayloadText(rawValue));
    if (
      !normalized ||
      seen.has(normalized) ||
      normalized.includes('[[null') ||
      /^[\s:[\]{},$]+null[\s:[\]{},$]*$/i.test(normalized)
    ) {
      return;
    }

    seen.add(normalized);
    strings.push(normalized);
  };

  const textNodePatterns = [
    /\[null\s*,\s*"([^"\\]{2,220})"/g,
    /"children"\s*:\s*\[\s*"([^"\\]{2,220})"\s*\]/g,
    /"a11yText"\s*:\s*"([^"\\]{2,220})"/g,
  ];
  textNodePatterns.forEach((pattern) => {
    let textMatch: RegExpExecArray | null;
    while ((textMatch = pattern.exec(value))) {
      addString(textMatch[1] || '');
    }
  });

  const quotedPattern = /"((?:\\.|[^"\\])*)"/g;

  let match: RegExpExecArray | null;
  while ((match = quotedPattern.exec(value))) {
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (typeof parsed !== 'string') {
        continue;
      }

      addString(parsed);
    } catch {
      /* Ignore non-JSON string fragments from streamed RSC payloads. */
    }
  }

  return strings;
}

function scoreProfileSlugMatch(value: string, linkedinUsername: string): number {
  const normalizedValue = value.toLowerCase();
  return linkedinUsername
    .split(/[-_]+/)
    .filter((part) => part.length > 2 && !/^\d+$/.test(part))
    .reduce((score, part) => score + (normalizedValue.includes(part) ? 1 : 0), 0);
}

function isTechnicalLinkedInString(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    value.length > 220 ||
    /^(offsetstart|offsetend|start|end|length|text|attributes|entityurn|navigationurl)$/i.test(value) ||
    /^\d+(?:\.\d+)?x$/i.test(value) ||
    /^-?\d+(?:\.\d+)?$/.test(value) ||
    /^https?:\/\//i.test(value) ||
    lower.includes('linkedin.com') ||
    lower.includes('urn:li:') ||
    lower.includes('proto.') ||
    lower.includes('profileview') ||
    lower.includes('wvmp') ||
    lower.includes('state:') ||
    lower.includes('binding') ||
    lower.includes('tracking') ||
    lower.includes('connect-button-disabled') ||
    lower.includes('profile-displayphoto') ||
    lower.includes('profile-framedphoto')
  );
}

function isProfileViewerUiText(value: string): boolean {
  return /^(connect|message|follow|view profile|1st|2nd|3rd|\d+th)$/i.test(value);
}

function isLikelyProfileHeadline(value: string, displayName: string, linkedinUsername: string): boolean {
  if (
    value === displayName ||
    value.length < 4 ||
    isTechnicalLinkedInString(value) ||
    isProfileViewerUiText(value) ||
    /viewed\s+.+?\sago/i.test(value) ||
    /\d+\s+mutual\s+connections?/i.test(value) ||
    scoreProfileSlugMatch(value, linkedinUsername) >= 2
  ) {
    return false;
  }

  return /\p{L}/u.test(value) && (/\s|[|/\\,.-]/.test(value) || value.length > 10);
}

function pickDisplayNameFromStrings(strings: string[], linkedinUsername: string): string {
  let bestName = '';
  let bestScore = 0;

  strings.forEach((value) => {
    if (isTechnicalLinkedInString(value) || isProfileViewerUiText(value) || /viewed\s+.+?\sago/i.test(value)) {
      return;
    }

    const score = scoreProfileSlugMatch(value, linkedinUsername);
    if (score > bestScore || (score === bestScore && score > 0 && value.length < bestName.length)) {
      bestName = value;
      bestScore = score;
    }
  });

  return bestScore > 0 ? bestName : '';
}

function pickHeadlineFromStrings(strings: string[], displayName: string, linkedinUsername: string): string {
  const displayNameIndex = strings.findIndex((value) => value === displayName);
  const candidates = displayNameIndex >= 0 ? strings.slice(displayNameIndex + 1) : strings;

  return candidates.find((value) => isLikelyProfileHeadline(value, displayName, linkedinUsername)) || '';
}

function parseProfileViewersFromRscPayload(payload: string): ProfileViewerInput[] {
  const normalizedPayload = normalizeLinkedInPayloadText(payload);
  const viewers: ProfileViewerInput[] = [];
  const seenUsernames = new Set<string>();
  const imageUrlsByDisplayName = extractProfileViewerImageUrls(normalizedPayload);
  const references = extractProfileViewerReferences(normalizedPayload);

  for (let referenceIndex = 0; referenceIndex < references.length; referenceIndex += 1) {
    const profile = references[referenceIndex];
    if (seenUsernames.has(profile.linkedinUsername)) {
      continue;
    }

    const nextProfileIndex = references[referenceIndex + 1]?.index;
    const referenceContextStart = profile.index;
    const referenceContextEnd = Math.min(
      normalizedPayload.length,
      nextProfileIndex || profile.index + 12_000,
      profile.index + 12_000
    );
    const referenceContext = normalizedPayload.slice(referenceContextStart, referenceContextEnd);
    const referenceStrings = extractQuotedStrings(referenceContext);
    const displayNameCandidate =
      pickDisplayNameFromStrings(referenceStrings, profile.linkedinUsername) ||
      humanizeLinkedInUsername(profile.linkedinUsername);
    const displayName = chooseProfileViewerDisplayName(
      displayNameCandidate,
      undefined,
      profile.linkedinUsername
    );

    const viewedAgoText = normalizeText(
      referenceContext.match(/Viewed\s+[^"'<\\]{1,80}?\sago/i)?.[0] || ''
    );
    const mutualConnectionsText = normalizeText(
      referenceContext.match(/\d+\s+mutual\s+connections?/i)?.[0] || ''
    );
    const connectionDegree = normalizeText(
      referenceStrings.find((value) => /^(1st|2nd|3rd|\d+th)$/i.test(value)) || ''
    );
    seenUsernames.add(profile.linkedinUsername);
    viewers.push({
      ...profile,
      displayName,
      headline: pickHeadlineFromStrings(referenceStrings, displayName, profile.linkedinUsername),
      profileImageUrl: imageUrlsByDisplayName.get(displayName.toLowerCase()) || '',
      connectionDegree,
      viewedAgoText,
      mutualConnectionsText,
      sourceIndex: profile.index,
    });
  }

  return viewers;
}

export function parseProfileViewersFromPayload(payload: string): ProfileViewerInput[] {
  const anchorViewers = parseVisibleProfileViewers(payload);
  const rscViewers = parseProfileViewersFromRscPayload(payload);
  return mergeProfileViewerCandidates([anchorViewers, rscViewers]);
}
