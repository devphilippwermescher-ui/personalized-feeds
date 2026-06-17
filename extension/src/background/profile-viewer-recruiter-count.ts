function decodePayloadText(value: string): string {
  return value
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function extractRecruiterProfileViewerCount(payload: string): number | null {
  const normalized = decodePayloadText(payload).replace(/\s+/g, ' ');
  const match = normalized.match(/\b([\d,]+)\s+recruiters?\s+viewed\s+your\s+profile\b/i);
  if (!match) {
    return null;
  }

  const count = Number(match[1].replace(/,/g, ''));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function extractRecruiterProfileViewerUrl(payload: string): string | null {
  const normalized = decodePayloadText(payload);
  const match = normalized.match(
    /(?:https:\/\/www\.linkedin\.com)?\/analytics\/recruiter-views\/\?[^"'<>\\\s]+/i
  );
  if (!match) {
    return null;
  }

  try {
    const url = new URL(match[0], 'https://www.linkedin.com');
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      return null;
    }

    return `https://www.linkedin.com${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
