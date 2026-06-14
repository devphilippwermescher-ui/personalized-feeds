const PRIVATE_VIEWERS_HELP_ARTICLE = 'linkedin/answer/a567226';
const PRIVATE_VIEWERS_CONTEXT_LENGTH = 16_000;

function normalizePayload(value: string): string {
  return value
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u0028/gi, '(')
    .replace(/\\u0029/gi, ')')
    .replace(/&amp;/gi, '&')
    .replace(/\\u200b/gi, '')
    .replace(/\u200b/g, '');
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
      helpArticleIndex
    );
    const countMatches = Array.from(
      context.matchAll(/LinkedIn[\s\S]{0,8000}?\(\s*(\d{1,6})\s*\)/giu)
    );
    const count = Number(countMatches[countMatches.length - 1]?.[1]);
    if (Number.isSafeInteger(count) && count >= 0) {
      return count;
    }

    searchFrom = helpArticleIndex + PRIVATE_VIEWERS_HELP_ARTICLE.length;
  }

  return null;
}
