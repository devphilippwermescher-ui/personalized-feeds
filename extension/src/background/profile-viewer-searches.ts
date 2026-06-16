import type { ProfileViewerSearchInput } from 'shared/types';

const SEARCH_PATH = '/search/results/people/';
const VOLATILE_SEARCH_PARAMS = new Set(['sid', 'trk', 'trackingId', 'lipi']);

function decodePayloadText(value: string): string {
  return value
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeText(value: string): string {
  return decodePayloadText(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractViewedAgoText(value: string): string {
  const text = normalizeText(value);
  return (
    text.match(/(?:Viewed|Переглянуто|Просмотрено)\s+.{1,80}?(?:ago|тому|назад)/iu)?.[0] ||
    ''
  );
}

function removeSearchUiText(value: string, viewedAgoText: string): string {
  return normalizeText(value)
    .replace(viewedAgoText, ' ')
    .replace(/\b(?:Search|Пошук|Поиск)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUrlLikeSearchDisplayName(value: string): boolean {
  const normalized = normalizeText(value).toLocaleLowerCase();
  return (
    /^https?:\/\//i.test(normalized) ||
    normalized.includes('linkedin.com') ||
    normalized.includes('/search/results/people') ||
    normalized.includes('/results/people') ||
    normalized.includes('currentcompany=') ||
    normalized.includes('origin=who_viewed_me')
  );
}

function isSearchDisplayNameCandidate(value: string, keywords: string): boolean {
  const normalized = normalizeText(value);
  return (
    normalized.length > 0 &&
    normalized.length <= 180 &&
    normalized.toLocaleLowerCase().includes(keywords.toLocaleLowerCase()) &&
    !isUrlLikeSearchDisplayName(normalized)
  );
}

function getQuotedStrings(value: string): string[] {
  const result: string[] = [];
  const pattern = /"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (typeof parsed === 'string') {
        const normalized = normalizeText(parsed);
        if (normalized) {
          result.push(normalized);
        }
      }
    } catch {
      // Ignore streamed RSC fragments that are not standalone JSON strings.
    }
  }

  return result;
}

function buildSearchIdentity(rawHref: string): {
  searchKey: string;
  searchUrl: string;
  keywords: string;
  currentCompany?: string;
} | null {
  try {
    const url = new URL(decodePayloadText(rawHref), 'https://www.linkedin.com');
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname) || url.pathname !== SEARCH_PATH) {
      return null;
    }

    const keywords = (url.searchParams.get('keywords') || '').trim();
    const origin = url.searchParams.get('origin');
    if (!keywords || (origin && origin !== 'WHO_VIEWED_ME')) {
      return null;
    }

    const stableEntries = Array.from(url.searchParams.entries())
      .filter(([key]) => !VOLATILE_SEARCH_PARAMS.has(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey
          ? leftValue.localeCompare(rightValue)
          : leftKey.localeCompare(rightKey)
      );
    const stableParams = new URLSearchParams(stableEntries);
    stableParams.set('origin', 'WHO_VIEWED_ME');

    const canonicalEntries = Array.from(stableParams.entries()).sort(
      ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)
    );
    const canonicalParams = new URLSearchParams(canonicalEntries);
    const searchKey = canonicalParams.toString();

    return {
      searchKey,
      searchUrl: `https://www.linkedin.com${SEARCH_PATH}?${searchKey}`,
      keywords,
      currentCompany: canonicalParams.get('currentCompany') || undefined,
    };
  } catch {
    return null;
  }
}

function getDisplayName(
  payload: string,
  sourceIndex: number,
  keywords: string,
  anchorHtml?: string
): { displayName: string; viewedAgoText: string } {
  const context = anchorHtml || payload.slice(Math.max(0, sourceIndex - 2_500), sourceIndex + 2_500);
  const viewedAgoText = extractViewedAgoText(context);

  if (anchorHtml) {
    const spanTexts = Array.from(anchorHtml.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi))
      .map((match) => removeSearchUiText(match[1], viewedAgoText))
      .filter((text) => isSearchDisplayNameCandidate(text, keywords));
    const matchingSpan = spanTexts[0];
    if (matchingSpan) {
      return { displayName: matchingSpan, viewedAgoText };
    }
  }

  const strings = getQuotedStrings(context);
  const normalizedKeywords = keywords.toLocaleLowerCase();
  const displayName =
    strings
      .map((text) => removeSearchUiText(text, viewedAgoText))
      .filter((text) => isSearchDisplayNameCandidate(text, normalizedKeywords))
      .sort((left, right) => {
        const leftExtra = Math.max(0, left.length - keywords.length);
        const rightExtra = Math.max(0, right.length - keywords.length);
        return rightExtra - leftExtra;
      })[0] || keywords;

  return { displayName, viewedAgoText };
}

export function extractProfileViewerSearches(payload: string): ProfileViewerSearchInput[] {
  const normalizedPayload = decodePayloadText(payload);
  const searches: ProfileViewerSearchInput[] = [];
  const seenKeys = new Set<string>();
  const anchorPattern =
    /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  const coveredIndexes: Array<[number, number]> = [];

  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(normalizedPayload))) {
    const href = match[2] || match[3] || match[4] || '';
    const identity = buildSearchIdentity(href);
    if (!identity || seenKeys.has(identity.searchKey)) {
      continue;
    }

    const text = getDisplayName(
      normalizedPayload,
      match.index,
      identity.keywords,
      match[5] || ''
    );
    seenKeys.add(identity.searchKey);
    coveredIndexes.push([match.index, anchorPattern.lastIndex]);
    searches.push({
      itemType: 'search',
      ...identity,
      ...text,
      sourceIndex: match.index,
    });
  }

  const searchUrlPattern =
    /(?:https:\/\/www\.linkedin\.com)?\/search\/results\/people\/\?[^"'<>\\\s]+/gi;
  while ((match = searchUrlPattern.exec(normalizedPayload))) {
    if (coveredIndexes.some(([start, end]) => match!.index >= start && match!.index < end)) {
      continue;
    }

    const identity = buildSearchIdentity(match[0]);
    if (!identity || seenKeys.has(identity.searchKey)) {
      continue;
    }

    seenKeys.add(identity.searchKey);
    searches.push({
      itemType: 'search',
      ...identity,
      ...getDisplayName(normalizedPayload, match.index, identity.keywords),
      sourceIndex: match.index,
    });
  }

  return searches.sort(
    (left, right) => (left.sourceIndex || 0) - (right.sourceIndex || 0)
  );
}
