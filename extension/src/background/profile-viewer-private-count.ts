const PRIVATE_VIEWERS_HELP_ARTICLE = 'linkedin/answer/a567226';
const PRIVATE_VIEWERS_CONTEXT_LENGTH = 16_000;
const PRIVATE_VIEWERS_CONTEXT_AFTER_LENGTH = 4_000;
const PRIVATE_VIEWERS_NEARBY_CONTEXT_LENGTH = 2_000;
const PRIVATE_VIEWERS_MARKER_PATTERN =
  /(private|confidential|\u043a\u043e\u043d\u0444\u0456\u0434\u0435\u043d\u0446\u0456\u0439\u043d|\u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b)/iu;
const LINKEDIN_MEMBER_COUNT_PATTERN =
  /LinkedIn[\s\S]{0,8000}?\(\s*(\d{1,6})\s*\)/giu;

function normalizePayload(value: string): string {
  return value
    .replace(/\\u([0-9a-f]{4})/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u0028/gi, '(')
    .replace(/\\u0029/gi, ')')
    .replace(/&#40;/gi, '(')
    .replace(/&#41;/gi, ')')
    .replace(/&amp;/gi, '&')
    .replace(/\\u200b/gi, '')
    .replace(/\u200b/g, '');
}

function getSafeCount(value: string | undefined): number | null {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function extractPrivateCountNearHelpArticle(context: string): number | null {
  const linkedInCountMatches = Array.from(
    context.matchAll(LINKEDIN_MEMBER_COUNT_PATTERN)
  );
  const linkedInCount = getSafeCount(
    linkedInCountMatches[linkedInCountMatches.length - 1]?.[1]
  );
  if (linkedInCount !== null) {
    return linkedInCount;
  }

  const countMatches = Array.from(
    context.matchAll(/\(\s*(\d{1,6})\s*\)/gu)
  );
  for (let index = countMatches.length - 1; index >= 0; index -= 1) {
    const match = countMatches[index];
    const count = getSafeCount(match[1]);
    if (count === null || typeof match.index !== 'number') {
      continue;
    }

    const nearbyContext = context.slice(
      match.index,
      match.index + PRIVATE_VIEWERS_NEARBY_CONTEXT_LENGTH
    );
    if (PRIVATE_VIEWERS_MARKER_PATTERN.test(nearbyContext)) {
      return count;
    }
  }

  return null;
}

export function extractPrivateProfileViewerCount(payload: string): number | null {
  const normalizedPayload = normalizePayload(payload);
  const lowerPayload = normalizedPayload.toLowerCase();
  let searchFrom = 0;

  while (searchFrom < lowerPayload.length) {
    const helpArticleIndex = lowerPayload.indexOf(
      PRIVATE_VIEWERS_HELP_ARTICLE,
      searchFrom
    );
    if (helpArticleIndex < 0) {
      break;
    }

    const context = normalizedPayload.slice(
      Math.max(0, helpArticleIndex - PRIVATE_VIEWERS_CONTEXT_LENGTH),
      Math.min(
        normalizedPayload.length,
        helpArticleIndex + PRIVATE_VIEWERS_CONTEXT_AFTER_LENGTH
      )
    );
    const count = extractPrivateCountNearHelpArticle(context);
    if (count !== null) {
      return count;
    }

    searchFrom = helpArticleIndex + PRIVATE_VIEWERS_HELP_ARTICLE.length;
  }

  return null;
}
