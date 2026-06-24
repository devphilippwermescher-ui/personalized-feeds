import type { FeedMemberInfo } from '../types';

const LINKEDIN_CONTENT_SEARCH_URL =
  'https://www.linkedin.com/search/results/content/';

export function extractLinkedInMemberToken(profileUrn?: string): string | null {
  if (!profileUrn) {
    return null;
  }

  const trimmed = profileUrn.trim();
  if (!trimmed) {
    return null;
  }

  if (/^ACo[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
}

export function buildLinkedInContentSearchUrl(
  members: ReadonlyArray<Pick<FeedMemberInfo, 'profileUrn'>>
): string | null {
  const memberTokens = Array.from(
    new Set(
      members
        .map((member) => extractLinkedInMemberToken(member.profileUrn))
        .filter((token): token is string => Boolean(token))
    )
  );

  if (memberTokens.length === 0) {
    return null;
  }

  const searchUrl = new URL(LINKEDIN_CONTENT_SEARCH_URL);
  searchUrl.searchParams.set('origin', 'FACETED_SEARCH');
  searchUrl.searchParams.set('sortBy', JSON.stringify(['date_posted']));
  searchUrl.searchParams.set('fromMember', JSON.stringify(memberTokens));

  return searchUrl.toString();
}
