import type { PostAuthorProfile } from '../../post-buttons/public';

export interface MessagingProfileTarget {
  degreeElement: HTMLElement;
  profile: PostAuthorProfile;
}

const CONNECTION_DEGREE_PATTERN = /^(?:[•·]\s*)?(1st|2nd|3rd\+?)$/i;
const PROFILE_CARD_SELECTOR = [
  '[class*="msg-thread__profile"]',
  '[class*="msg-thread-profile"]',
  '[class*="messaging-profile"]',
  '[data-view-name*="messaging-profile"]',
].join(', ');

function normalizedText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function getLinkedInUsername(profileUrl: string): string {
  try {
    const url = new URL(profileUrl, window.location.origin);
    const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : '';
  } catch {
    return '';
  }
}

function cleanDisplayName(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^View\s+/i, '')
    .replace(/(?:’s|'s)?\s+profile.*$/i, '')
    .replace(/\s*[•·]\s*(?:1st|2nd|3rd\+?)\b.*$/i, '')
    .replace(/\s+(?:1st|2nd|3rd\+?)\b.*$/i, '')
    .trim();
}

function findProfileLink(degreeElement: HTMLElement): HTMLAnchorElement | null {
  const directLink = degreeElement.closest<HTMLAnchorElement>('a[href*="/in/"]');
  if (directLink) return directLink;

  let current: HTMLElement | null = degreeElement.parentElement;
  for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
    const links = Array.from(current.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'));
    const namedLink = links.find((link) => cleanDisplayName(link.getAttribute('aria-label') || link.textContent || ''));
    if (namedLink) return namedLink;
  }

  return null;
}

function findProfileCard(degreeElement: HTMLElement, profileLink: HTMLAnchorElement): HTMLElement {
  const explicitCard = degreeElement.closest<HTMLElement>(PROFILE_CARD_SELECTOR);
  if (explicitCard) {
    let current: HTMLElement | null = explicitCard;
    for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
      const hasProfileDetails = Boolean(
        current.querySelector('img, [class*="headline"], [class*="occupation"], [class*="description"]')
      );
      if (current.contains(profileLink) && hasProfileDetails) return current;
    }
    return explicitCard;
  }

  let current = degreeElement.parentElement;
  let bestMatch = current || degreeElement;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    if (!current.contains(profileLink)) continue;
    bestMatch = current;
    if (current.querySelector('img')) return current;
  }

  return bestMatch;
}

function findDisplayName(card: HTMLElement, profileLink: HTMLAnchorElement): string {
  const candidates = [
    profileLink.getAttribute('aria-label') || '',
    normalizedText(profileLink.querySelector('[aria-hidden="true"]')),
    normalizedText(profileLink),
    normalizedText(card.querySelector('h1, h2, h3, [class*="name"]')),
  ];

  return candidates.map(cleanDisplayName).find(Boolean) || '';
}

function findHeadline(card: HTMLElement, displayName: string): string {
  const candidates = card.querySelectorAll<HTMLElement>(
    '[class*="headline"], [class*="occupation"], [class*="description"], p'
  );

  return (
    Array.from(candidates)
      .map(normalizedText)
      .find((text) => text && text !== displayName && !CONNECTION_DEGREE_PATTERN.test(text)) || ''
  );
}

function isInnermostDegreeElement(element: HTMLElement): boolean {
  const text = normalizedText(element);
  if (!CONNECTION_DEGREE_PATTERN.test(text)) return false;

  return !Array.from(element.querySelectorAll<HTMLElement>('span, a')).some(
    (child) => child !== element && CONNECTION_DEGREE_PATTERN.test(normalizedText(child))
  );
}

function getConnectionDegree(element: HTMLElement): string {
  return normalizedText(element).match(CONNECTION_DEGREE_PATTERN)?.[1] || '';
}

export function isLinkedInMessagingRoute(pathname: string): boolean {
  return /^\/messaging(?:\/|$)/i.test(pathname);
}

export function findMessagingProfileTargets(root: ParentNode = document): MessagingProfileTarget[] {
  const targets: MessagingProfileTarget[] = [];

  root
    .querySelectorAll<HTMLElement>('span, a, [class*="connection-degree"], [class*="connectionDegree"]')
    .forEach((degreeElement) => {
      if (!isInnermostDegreeElement(degreeElement) || degreeElement.closest('.lfa-messaging-feed-btn-wrapper')) {
        return;
      }

      const profileLink = findProfileLink(degreeElement);
      if (!profileLink) return;

      const linkedinUsername = getLinkedInUsername(profileLink.href);
      if (!linkedinUsername) return;

      const card = findProfileCard(degreeElement, profileLink);
      const displayName = findDisplayName(card, profileLink);
      if (!displayName) return;

      targets.push({
        degreeElement,
        profile: {
          linkedinUrl: profileLink.href,
          linkedinUsername,
          displayName,
          headline: findHeadline(card, displayName),
          profileImageUrl: card.querySelector<HTMLImageElement>('img')?.src || '',
          connectionDegree: getConnectionDegree(degreeElement),
        },
      });
    });

  return targets;
}
