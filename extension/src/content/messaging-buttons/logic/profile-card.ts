import type { PostAuthorProfile } from '../../post-buttons/public';
import { findLinkedInProfileImageUrl } from '../../shared/linkedin-profile-image';

export interface MessagingProfileTarget {
  degreeElement: HTMLElement;
  insertPosition: 'afterend' | 'beforeend';
  profile: PostAuthorProfile;
}

interface ConnectionDegreeAnchor {
  element: HTMLElement;
  degree: string;
  insertPosition: 'afterend' | 'beforeend';
  priority: number;
}

const CONNECTION_DEGREE_PATTERN = /^(?:[•·]\s*)?(1st|2nd|3rd\+?)(?:[-\s]+degree(?:\s+connection)?)?$/i;
const DEGREE_ELEMENT_SELECTOR = [
  'span',
  'a',
  'button',
  'p',
  '[class*="connection-degree"]',
  '[class*="connectionDegree"]',
  '[aria-label*="degree connection" i]',
].join(', ');
const PROFILE_CARD_SELECTOR = [
  '[class*="msg-thread__profile"]',
  '[class*="msg-thread-profile"]',
  '[class*="msg-thread-banner"]',
  '[class*="msg-thread__link-to-profile"]',
  '[class*="msg-entity-lockup"]',
  '[class*="msg-s-message-list__profile"]',
  '[class*="msg-s-message-list__top-banner"]',
  '[class*="messaging-profile"]',
  '[data-view-name*="messaging-profile"]',
  '[data-test-id*="conversation-details"]',
].join(', ');

function normalizedText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function parseConnectionDegree(value: string): string {
  return value.replace(/\s+/g, ' ').trim().match(CONNECTION_DEGREE_PATTERN)?.[1] || '';
}

function getElementConnectionDegree(element: HTMLElement): string {
  return (
    parseConnectionDegree(normalizedText(element)) ||
    parseConnectionDegree(element.getAttribute('aria-label') || '') ||
    parseConnectionDegree(element.getAttribute('title') || '')
  );
}

function isAccessibilityOnlyDegreeElement(element: HTMLElement): boolean {
  return element.matches('.a11y-text, .visually-hidden');
}

function getDegreeAnchorPriority(element: HTMLElement): number {
  const visibleTextPriority = parseConnectionDegree(normalizedText(element)) ? 100 : 30;
  return visibleTextPriority - (isAccessibilityOnlyDegreeElement(element) ? 90 : 0);
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

  const explicitCard = degreeElement.closest<HTMLElement>(PROFILE_CARD_SELECTOR);
  const explicitCardLink = explicitCard?.querySelector<HTMLAnchorElement>('a[href*="/in/"]');
  if (explicitCardLink) return explicitCardLink;

  let current: HTMLElement | null = degreeElement.parentElement;
  for (let depth = 0; current && depth < 14; depth += 1, current = current.parentElement) {
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

function findIdentityRowInsertionAnchor(
  degreeAnchor: ConnectionDegreeAnchor,
  card: HTMLElement,
  displayName: string
): Pick<ConnectionDegreeAnchor, 'element' | 'insertPosition'> {
  if (degreeAnchor.insertPosition === 'beforeend') {
    return degreeAnchor;
  }

  let current = degreeAnchor.element.parentElement;
  for (let depth = 0; current && current !== card && depth < 4; depth += 1, current = current.parentElement) {
    const text = normalizedText(current);
    const containsName = Boolean(displayName && text.includes(displayName));
    const containsDegree = /(?:^|[•·\s])(1st|2nd|3rd\+?)(?:\s|$)/i.test(text);
    const containsHeadline = Boolean(
      current.querySelector('[class*="headline"], [class*="occupation"], [class*="description"], p')
    );

    if (containsName && containsDegree && !containsHeadline) {
      // LinkedIn renders an accessibility-only degree marker before the
      // visible "· 1st" text. Appending to their shared identity row places
      // the control after the complete visible degree, regardless of which
      // marker was discovered first.
      return { element: current, insertPosition: 'beforeend' };
    }
  }

  return degreeAnchor;
}

function isInnermostDegreeElement(element: HTMLElement): boolean {
  if (!getElementConnectionDegree(element)) return false;

  return !Array.from(element.querySelectorAll<HTMLElement>(DEGREE_ELEMENT_SELECTOR)).some(
    (child) => child !== element && Boolean(getElementConnectionDegree(child))
  );
}

function findElementDegreeAnchor(root: ParentNode): ConnectionDegreeAnchor | null {
  if (root instanceof HTMLElement && isInnermostDegreeElement(root)) {
    return {
      element: root,
      degree: getElementConnectionDegree(root),
      insertPosition: 'afterend',
      priority: getDegreeAnchorPriority(root),
    };
  }

  const element = Array.from(root.querySelectorAll<HTMLElement>(DEGREE_ELEMENT_SELECTOR)).find(
    isInnermostDegreeElement
  );
  if (!element) return null;

  return {
    element,
    degree: getElementConnectionDegree(element),
    insertPosition: 'afterend',
    priority: getDegreeAnchorPriority(element),
  };
}

function findDirectTextDegreeAnchor(root: ParentNode): ConnectionDegreeAnchor | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();

  while (textNode) {
    const degree = parseConnectionDegree(textNode.textContent || '');
    const parent = textNode.parentElement;
    if (degree && parent && !parent.closest('.lfa-messaging-feed-btn-wrapper')) {
      return {
        element: parent,
        degree,
        // New LinkedIn Messaging markup can render "· 1st" as a bare text
        // node beside the name and badge. Appending keeps the button on that row.
        insertPosition: parent.matches('a, button') ? 'afterend' : 'beforeend',
        priority: 80,
      };
    }
    textNode = walker.nextNode();
  }

  return null;
}

function findDegreeAnchorNearProfileLink(profileLink: HTMLAnchorElement): ConnectionDegreeAnchor | null {
  let current: HTMLElement | null = profileLink;
  for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
    if (current === document.body || current === document.documentElement || current.tagName === 'MAIN') {
      return null;
    }

    if (current.querySelectorAll('a[href*="/in/"]').length > 4) {
      return null;
    }

    const elementAnchor = findElementDegreeAnchor(current);
    const textAnchor = findDirectTextDegreeAnchor(current);
    if (elementAnchor || textAnchor) {
      return [elementAnchor, textAnchor]
        .filter((anchor): anchor is ConnectionDegreeAnchor => Boolean(anchor))
        .sort((left, right) => right.priority - left.priority)[0];
    }
  }

  return null;
}

function buildMessagingProfileTarget(
  degreeAnchor: ConnectionDegreeAnchor,
  profileLink: HTMLAnchorElement
): MessagingProfileTarget | null {
  const linkedinUsername = getLinkedInUsername(profileLink.href);
  if (!linkedinUsername) return null;

  const card = findProfileCard(degreeAnchor.element, profileLink);
  const displayName = findDisplayName(card, profileLink);
  if (!displayName) return null;
  const insertionAnchor = findIdentityRowInsertionAnchor(degreeAnchor, card, displayName);

  return {
    degreeElement: insertionAnchor.element,
    insertPosition: insertionAnchor.insertPosition,
    profile: {
      linkedinUrl: profileLink.href,
      linkedinUsername,
      displayName,
      headline: findHeadline(card, displayName),
      profileImageUrl: findLinkedInProfileImageUrl(card),
      connectionDegree: degreeAnchor.degree,
    },
  };
}

export function isLinkedInMessagingRoute(pathname: string): boolean {
  return /^\/messaging(?:\/|$)/i.test(pathname);
}

export function findMessagingProfileTargets(root: ParentNode = document): MessagingProfileTarget[] {
  const targetsByProfile = new Map<string, { target: MessagingProfileTarget; priority: number }>();
  const seenDegreeElements = new Set<HTMLElement>();

  const addTarget = (degreeAnchor: ConnectionDegreeAnchor, profileLink: HTMLAnchorElement): void => {
    if (seenDegreeElements.has(degreeAnchor.element)) return;

    const target = buildMessagingProfileTarget(degreeAnchor, profileLink);
    if (!target) return;

    seenDegreeElements.add(degreeAnchor.element);
    const profileKey = target.profile.linkedinUsername.toLowerCase();
    const existingTarget = targetsByProfile.get(profileKey);
    if (!existingTarget || degreeAnchor.priority > existingTarget.priority) {
      targetsByProfile.set(profileKey, { target, priority: degreeAnchor.priority });
    }
  };

  root.querySelectorAll<HTMLElement>(DEGREE_ELEMENT_SELECTOR).forEach((degreeElement) => {
    if (!isInnermostDegreeElement(degreeElement) || degreeElement.closest('.lfa-messaging-feed-btn-wrapper')) {
      return;
    }

    const profileLink = findProfileLink(degreeElement);
    if (!profileLink) return;

    addTarget(
      {
        element: degreeElement,
        degree: getElementConnectionDegree(degreeElement),
        insertPosition: 'afterend',
        priority: getDegreeAnchorPriority(degreeElement),
      },
      profileLink
    );
  });

  // During client-side navigation LinkedIn sometimes renders the profile link
  // first and places the connection degree in a bare text node. Starting from
  // the stable /in/ link lets us handle that intermediate DOM without reload.
  root.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]').forEach((profileLink) => {
    const profileKey = getLinkedInUsername(profileLink.href).toLowerCase();
    if (!profileKey || (targetsByProfile.get(profileKey)?.priority || 0) >= 100) return;

    const degreeAnchor = findDegreeAnchorNearProfileLink(profileLink);
    if (degreeAnchor) {
      addTarget(degreeAnchor, profileLink);
    }
  });

  return Array.from(targetsByProfile.values(), ({ target }) => target);
}
