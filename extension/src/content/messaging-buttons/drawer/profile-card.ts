import type { PostAuthorProfile } from '../../post-buttons/public';

export interface MessagingDrawerProfileTarget {
  cardElement: HTMLElement;
  identityRow: HTMLElement;
  profile: PostAuthorProfile;
}

const PROFILE_CARD_SELECTOR = '.msg-s-profile-card';
const IDENTITY_ROW_SELECTOR = '.artdeco-entity-lockup__title';
const PROFILE_LINK_SELECTOR = [
  'a.profile-card-one-to-one__profile-link[href*="/in/"]',
  '.artdeco-entity-lockup__title a[href*="/in/"]',
].join(', ');

function normalizedText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function getLinkedInUsername(profileUrl: string, baseUrl: string): string {
  try {
    const url = new URL(profileUrl, baseUrl);
    const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : '';
  } catch {
    return '';
  }
}

function getDocumentBaseUrl(targetDocument: Document): string {
  try {
    const documentUrl = new URL(targetDocument.location.href);
    if (documentUrl.protocol === 'http:' || documentUrl.protocol === 'https:') return documentUrl.href;
  } catch {
    // about:blank preload documents inherit the reachable top document below.
  }

  return window.location.href;
}

function getConnectionDegree(card: HTMLElement): string {
  const degreeElement = card.querySelector<HTMLElement>(
    '.artdeco-entity-lockup__degree, [aria-label*="degree connection" i]'
  );
  const degreeText = [
    normalizedText(degreeElement),
    degreeElement?.getAttribute('aria-label') || '',
    degreeElement?.getAttribute('title') || '',
  ].find(Boolean);

  return degreeText?.match(/\b(1st|2nd|3rd\+?)\b/i)?.[1] || '';
}

function findNamedProfileLink(card: HTMLElement): HTMLAnchorElement | null {
  return (
    Array.from(card.querySelectorAll<HTMLAnchorElement>(PROFILE_LINK_SELECTOR)).find((link) =>
      Boolean(normalizedText(link))
    ) || null
  );
}

export function findMessagingDrawerProfileTargets(root: ParentNode): MessagingDrawerProfileTarget[] {
  return Array.from(root.querySelectorAll<HTMLElement>(PROFILE_CARD_SELECTOR)).flatMap((cardElement) => {
    const identityRow = cardElement.querySelector<HTMLElement>(IDENTITY_ROW_SELECTOR);
    const profileLink = findNamedProfileLink(cardElement);
    if (!identityRow || !profileLink) return [];

    const baseUrl = getDocumentBaseUrl(cardElement.ownerDocument);
    const profileUrl = profileLink.getAttribute('href') || profileLink.href;
    const linkedinUsername = getLinkedInUsername(profileUrl, baseUrl);
    const displayName = normalizedText(profileLink);
    const connectionDegree = getConnectionDegree(cardElement);
    if (!linkedinUsername || !displayName || !connectionDegree) return [];

    return [
      {
        cardElement,
        identityRow,
        profile: {
          linkedinUrl: new URL(profileUrl, baseUrl).href,
          linkedinUsername,
          displayName,
          headline: normalizedText(cardElement.querySelector('.artdeco-entity-lockup__subtitle')),
          profileImageUrl: cardElement.querySelector<HTMLImageElement>('img')?.src || '',
          connectionDegree,
        },
      },
    ];
  });
}
