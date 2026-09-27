import type { ProfileViewerInput } from 'shared/types';
import { isValidLinkedInProfileUsername } from 'shared/linkedin-identity';
import { parseProfileViewerCardsFromRsc } from './parsers/rsc-card-parser';
import { mergeProfileViewerCandidates } from './profile-viewers-parser-merge';
import { hasExplicitProfileViewerPremiumSignal } from './profile-viewers-premium';

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
  return normalizeText(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
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
    (imageMatch ? getHtmlAttribute(imageMatch[0], 'alt') : '') || svgLabelMatch?.[2] || svgLabelMatch?.[3] || ''
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
    isPremium: hasExplicitProfileViewerPremiumSignal(anchorHtml) || undefined,
    identityUncertain: false,
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

export function parseProfileViewersFromPayload(payload: string): ProfileViewerInput[] {
  const anchorViewers = parseVisibleProfileViewers(payload);
  const rscViewers = parseProfileViewerCardsFromRsc(payload);
  return mergeProfileViewerCandidates([anchorViewers, rscViewers]);
}
