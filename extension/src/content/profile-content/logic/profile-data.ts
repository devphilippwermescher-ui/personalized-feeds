import type { ProfileData } from '../types';
import { isWeakProfileViewerDisplayName } from 'shared/profile-viewer-quality';
import { isProfileRelationshipActionElement } from './profile-action-elements';

export function extractUsernameFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/in\/([^/]+)/);
  return match ? match[1] : null;
}

function normalizeLinkedInUsername(value: string): string {
  const normalized = value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function getUsernameFromHref(value: string | null): string {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value, window.location.origin);
    const match = url.pathname.match(/^\/in\/([^/]+)/);
    return normalizeLinkedInUsername(match?.[1] || '');
  } catch {
    return '';
  }
}

function getProfileHrefCandidates(username: string): string[] {
  return [
    `https://www.linkedin.com/in/${username}/`,
    `https://www.linkedin.com/in/${username}`,
    `/in/${username}/`,
    `/in/${username}`,
  ];
}

function hasModernTopCardSignals(element: Element, username = ''): boolean {
  const hasProfileAction = Array.from(element.querySelectorAll('button, a, [role="button"], [role="menuitem"]')).some(
    isProfileRelationshipActionElement
  );
  const hasTrustworthyHeading = Array.from(element.querySelectorAll<HTMLElement>('h1, h2')).some((heading) => {
    const value = heading.textContent?.replace(/\s+/g, ' ').trim() || '';
    return !isWeakProfileViewerDisplayName(value, username);
  });

  return Boolean(
    hasTrustworthyHeading && (hasProfileAction || element.querySelector('a[href*="/overlay/contact-info/"]'))
  );
}

function overlapsExcludedSurface(candidate: HTMLElement, excludedSurface?: HTMLElement | null): boolean {
  return Boolean(
    excludedSurface &&
    (candidate === excludedSurface || candidate.contains(excludedSurface) || excludedSurface.contains(candidate))
  );
}

function findModernTopCardByComponentKey(
  username: string,
  root: ParentNode = document,
  excludedSurface?: HTMLElement | null
): HTMLElement | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('section[componentkey*="Topcard"], section[componentkey*="topcard"]')
  );

  for (const candidate of candidates) {
    if (!overlapsExcludedSurface(candidate, excludedSurface) && hasModernTopCardSignals(candidate, username)) {
      return candidate;
    }
  }

  return null;
}

function findModernTopCardByHeading(username: string, mainContent: HTMLElement): HTMLElement | null {
  const headings = Array.from(mainContent.querySelectorAll<HTMLElement>('h1, h2')).filter((heading) => {
    if (heading.closest('aside, .scaffold-layout__aside')) {
      return false;
    }

    const value = heading.textContent?.replace(/\s+/g, ' ').trim() || '';
    return !isWeakProfileViewerDisplayName(value, username);
  });

  for (const heading of headings) {
    let current = heading.parentElement;
    let depth = 0;

    while (current && current !== mainContent && depth < 8) {
      const relationshipActionCount = Array.from(
        current.querySelectorAll('button, a, [role="button"], [role="menuitem"]')
      ).filter(isProfileRelationshipActionElement).length;
      const hasContactInfo = Boolean(current.querySelector('a[href*="/overlay/contact-info/"]'));
      const hasCurrentProfileLink = Array.from(current.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]')).some(
        (link) => getUsernameFromHref(link.getAttribute('href')) === normalizeLinkedInUsername(username)
      );

      if (
        hasModernTopCardSignals(current, username) &&
        relationshipActionCount >= 1 &&
        (hasContactInfo || hasCurrentProfileLink)
      ) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }
  }

  return null;
}

function findModernTopCardByContactInfo(mainContent: HTMLElement): HTMLElement | null {
  const contactLinks = Array.from(
    mainContent.querySelectorAll<HTMLAnchorElement>('a[href*="/overlay/contact-info/"]')
  ).filter((link) => !link.closest('aside, .scaffold-layout__aside'));

  for (const contactLink of contactLinks) {
    const semanticTopCard = contactLink.closest<HTMLElement>(
      'section[componentkey*="topcard" i], section, .pv-top-card'
    );
    if (
      semanticTopCard &&
      mainContent.contains(semanticTopCard) &&
      Array.from(semanticTopCard.querySelectorAll('button, a, [role="button"], [role="menuitem"]')).some(
        isProfileRelationshipActionElement
      )
    ) {
      return semanticTopCard;
    }

    let current = contactLink.parentElement;
    let depth = 0;

    while (current && current !== mainContent && depth < 10) {
      const hasRelationshipAction = Array.from(
        current.querySelectorAll('button, a, [role="button"], [role="menuitem"]')
      ).some(isProfileRelationshipActionElement);

      if (hasRelationshipAction) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }
  }

  return null;
}

function findProfileToolbar(username: string, excludedSurface?: HTMLElement | null): HTMLElement | null {
  const normalizedUsername = normalizeLinkedInUsername(username);
  const toolbars = Array.from(document.querySelectorAll<HTMLElement>('[role="toolbar"]'));

  for (const toolbar of toolbars) {
    if (overlapsExcludedSurface(toolbar, excludedSurface)) {
      continue;
    }

    const hasCurrentProfileLink = Array.from(toolbar.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]')).some(
      (link) => getUsernameFromHref(link.getAttribute('href')) === normalizedUsername
    );
    const hasRelationshipAction = Array.from(
      toolbar.querySelectorAll('button, a, [role="button"], [role="menuitem"]')
    ).some(isProfileRelationshipActionElement);

    if (hasCurrentProfileLink && hasRelationshipAction) {
      return toolbar;
    }
  }

  return null;
}

function findPrimaryProfileContentRoot(): HTMLElement | null {
  const semanticMain = document.querySelector<HTMLElement>('main.scaffold-layout__main');
  if (semanticMain) {
    return semanticMain;
  }

  const scaffoldMain = document.querySelector<HTMLElement>('.scaffold-layout__main');
  if (scaffoldMain) {
    return scaffoldMain;
  }

  const main = document.querySelector<HTMLElement>('main');
  if (!main) {
    return null;
  }

  return main;
}

export function findPrimaryProfileTopCardRoot(username = extractUsernameFromUrl() || ''): HTMLElement | null {
  const mainContent = findPrimaryProfileContentRoot();
  if (!mainContent) {
    return null;
  }

  const mainComponentRoot = findModernTopCardByComponentKey(username, mainContent);
  if (mainComponentRoot) {
    return mainComponentRoot;
  }

  const legacyRoot = mainContent.querySelector<HTMLElement>('.pv-top-card');
  if (legacyRoot) {
    return legacyRoot;
  }

  if (username) {
    const contactInfoRoot = findModernTopCardByContactInfo(mainContent);
    if (contactInfoRoot) {
      return contactInfoRoot;
    }
  }

  if (!username) {
    return null;
  }

  // The initial profile hero in LinkedIn's newer layout does not always include
  // a component key or a self-referencing /in/ link. Walk up from a trustworthy
  // heading only as far as the nearest profile action group, never the whole page.
  const headingRoot = findModernTopCardByHeading(username, mainContent);
  if (headingRoot) {
    return headingRoot;
  }

  const normalizedUsername = normalizeLinkedInUsername(username);
  const profileLinks = Array.from(mainContent.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]')).filter(
    (link) => getUsernameFromHref(link.getAttribute('href')) === normalizedUsername
  );

  for (const link of profileLinks) {
    let current: Element | null = link;
    let depth = 0;

    while (current && current !== document.body && depth < 10) {
      if (hasModernTopCardSignals(current, username)) {
        return current as HTMLElement;
      }
      current = current.parentElement;
      depth += 1;
    }
  }

  return null;
}

export function findProfileTopCardRoot(
  username = extractUsernameFromUrl() || '',
  excludedSurface?: HTMLElement | null
): HTMLElement | null {
  const toolbarRoot = findProfileToolbar(username, excludedSurface);
  if (toolbarRoot) {
    return toolbarRoot;
  }

  const modernComponentRoot = findModernTopCardByComponentKey(username, document, excludedSurface);
  if (modernComponentRoot) {
    return modernComponentRoot;
  }

  const legacyRoot = Array.from(document.querySelectorAll<HTMLElement>('.pv-top-card')).find(
    (candidate) => !overlapsExcludedSurface(candidate, excludedSurface)
  );
  if (legacyRoot) {
    return legacyRoot;
  }

  if (!username) {
    return null;
  }

  const normalizedUsername = normalizeLinkedInUsername(username);
  const profileLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]')).filter(
    (link) => getUsernameFromHref(link.getAttribute('href')) === normalizedUsername && !excludedSurface?.contains(link)
  );

  for (const link of profileLinks) {
    let current: Element | null = link;
    let depth = 0;

    while (current && current !== document.body && depth < 10) {
      if (
        !overlapsExcludedSurface(current as HTMLElement, excludedSurface) &&
        hasModernTopCardSignals(current, username)
      ) {
        return current as HTMLElement;
      }
      current = current.parentElement;
      depth += 1;
    }
  }

  return null;
}

function firstNonEmptyText(selectors: string[], root: ParentNode): string {
  for (const selector of selectors) {
    const value = root.querySelector(selector)?.textContent?.trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function extractProfileDisplayName(root: ParentNode, username: string): string {
  const normalizeCandidates = (elements: HTMLElement[]): string[] =>
    elements
      .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter((value) => !isWeakProfileViewerDisplayName(value, username));
  const usernameParts = normalizeLinkedInUsername(username)
    .split(/[-_]+/)
    .filter((part) => part.length > 2 && !/^\d+$/.test(part));
  const chooseBestCandidate = (candidates: string[]): string =>
    candidates.reduce((best, candidate) => {
      const score = usernameParts.filter((part) => candidate.toLowerCase().includes(part)).length;
      const bestScore = usernameParts.filter((part) => best.toLowerCase().includes(part)).length;
      return score > bestScore ? candidate : best;
    }, candidates[0] || '');

  const primaryHeadings = normalizeCandidates(Array.from(root.querySelectorAll<HTMLElement>('h1')));
  if (primaryHeadings.length > 0) {
    return chooseBestCandidate(primaryHeadings);
  }

  const secondaryHeadings = normalizeCandidates(Array.from(root.querySelectorAll<HTMLElement>('h2')));
  if (secondaryHeadings.length > 0) {
    const bestHeading = chooseBestCandidate(secondaryHeadings);
    if (bestHeading) {
      return bestHeading;
    }
  }

  const normalizedUsername = normalizeLinkedInUsername(username);
  const profileLinkName = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'))
    .filter((link) => getUsernameFromHref(link.getAttribute('href')) === normalizedUsername)
    .map((link) => link.textContent?.replace(/\s+/g, ' ').trim() || '')
    .find((value) => !isWeakProfileViewerDisplayName(value, username));

  return profileLinkName || '';
}

function extractModernHeadline(root: ParentNode): string {
  const paragraphs = Array.from(root.querySelectorAll('p'));
  for (const paragraph of paragraphs) {
    const text = paragraph.textContent?.trim() || '';
    if (!text) continue;
    if (/^(?:·\s*)?(1st|2nd|3rd\+?|3rd)$/i.test(text)) continue;
    if (/connections?$/i.test(text)) continue;
    if (/contact info/i.test(text)) continue;
    if (/mutual connections?/i.test(text)) continue;
    if (/followers?$/i.test(text)) continue;
    if (text.length < 4) continue;
    return text;
  }

  return '';
}

function extractModernLocation(root: ParentNode): string {
  const paragraphs = Array.from(root.querySelectorAll('p'));
  for (const paragraph of paragraphs) {
    const text = paragraph.textContent?.trim() || '';
    if (!text) continue;
    if (/contact info/i.test(text)) continue;
    if (/connections?$/i.test(text)) continue;
    if (/,/.test(text)) {
      return text;
    }
  }

  return '';
}

function cleanTopCardCompanyText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^Current company\s*:?\s*/i, '')
    .replace(/\.\s*Click to view.*$/i, '')
    .replace(/\s*logo$/i, '')
    .trim();
}

function isLikelyCompanyText(value: string, displayName: string, headline: string, location: string): boolean {
  const normalized = cleanTopCardCompanyText(value);
  if (!normalized || normalized.length > 80 || normalized.includes('|') || /[<>/@{}[\]#$]/.test(normalized)) {
    return false;
  }

  const lower = normalized.toLowerCase();
  const excluded = [displayName, headline, location]
    .map((item) => item.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
  if (excluded.includes(lower)) {
    return false;
  }

  return !/\b(?:connections?|followers?|contact info|open to|add section|enhance profile|message|connect|follow|university|school|college|profile language|public profile)\b/i.test(
    normalized
  );
}

function extractModernCompany(root: ParentNode, displayName: string, headline: string, location: string): string {
  const selectors = [
    'button[aria-label*="Current company" i]',
    'a[aria-label*="Current company" i]',
    'button[aria-label*="company" i]',
    'a[href*="/company/"]',
    '.pv-top-card--experience-list-item',
  ];

  for (const selector of selectors) {
    const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
    for (const element of elements) {
      const candidates = [
        element.getAttribute('aria-label') || '',
        element.querySelector('[aria-hidden="true"]')?.textContent || '',
        element.textContent || '',
      ];
      for (const candidate of candidates) {
        const company = cleanTopCardCompanyText(candidate);
        if (isLikelyCompanyText(company, displayName, headline, location)) {
          return company;
        }
      }
    }
  }

  return '';
}

function extractConnectionDegree(root: ParentNode): string {
  const explicit = firstNonEmptyText(['.dist-value'], root);
  if (explicit) {
    return explicit;
  }

  const text = root.textContent || '';
  const match = text.match(/(?:^|\u00b7|\s)(1st|2nd|3rd\+?|3rd)(?:$|\s)/i);
  return match?.[1] || '';
}

function parseLinkedInCount(value: string): number | undefined {
  const normalized = value.replace(/,/g, '').trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)([kKmM])?\+?/);
  if (!match) {
    return undefined;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return undefined;
  }

  const suffix = (match[2] || '').toLowerCase();
  if (suffix === 'k') {
    return Math.round(base * 1000);
  }
  if (suffix === 'm') {
    return Math.round(base * 1000000);
  }
  return Math.round(base);
}

function extractCountBeforeLabel(root: ParentNode, label: 'connections' | 'followers'): number | undefined {
  const text = root.textContent?.replace(/\s+/g, ' ') || '';
  const pattern = new RegExp(`([\\d,.]+(?:[kKmM])?\\+?)\\s+${label}\\b`, 'gi');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const contextStart = Math.max(0, match.index - 30);
    const context = text.slice(contextStart, match.index).toLowerCase();
    if (label === 'connections' && /mutual\s+$/.test(context)) {
      continue;
    }

    const count = parseLinkedInCount(match[1]);
    if (typeof count === 'number') {
      return count;
    }
  }

  return undefined;
}

function extractProfileUrnFromPage(): string {
  const html = document.documentElement.innerHTML;
  const match = html.match(/urn:li:fsd_profile:[A-Za-z0-9_-]+/);
  return match?.[0] || '';
}

function extractMemberNumericIdFromPage(section: HTMLElement): string {
  const explicit = section.getAttribute('data-member-id') || '';
  if (/^\d+$/.test(explicit)) {
    return explicit;
  }

  const html = document.documentElement.innerHTML;
  const statePatterns = [
    /urn:li:fsd_followingState:urn:li:member:(\d+)/i,
    /state:invitation:urn:li:member:(\d+)/i,
    /urn:li:member:(\d+)/i,
  ];

  for (const pattern of statePatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return '';
}

function isLikelyPrimaryProfileImage(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src || '';
  if (!src.includes('profile-displayphoto') && !src.includes('profile-framedphoto')) {
    return false;
  }

  const alt = (img.getAttribute('alt') || '').trim();
  if (/mutual connection/i.test(alt)) {
    return false;
  }

  const width = img.naturalWidth || img.clientWidth || 0;
  const height = img.naturalHeight || img.clientHeight || 0;

  return width >= 80 && height >= 80;
}

function isLinkedInProfileImageUrl(src: string): boolean {
  return src.includes('profile-displayphoto') || src.includes('profile-framedphoto');
}

function extractImageSrc(img: HTMLImageElement | null): string {
  if (!img) {
    return '';
  }

  const src = img.currentSrc || img.src || '';
  return isLinkedInProfileImageUrl(src) ? src : '';
}

function extractPrimaryProfileImage(section: ParentNode, username: string): string {
  for (const href of getProfileHrefCandidates(username)) {
    const profileLink = section.querySelector(`a[href="${href}"]`) as HTMLAnchorElement | null;
    if (!profileLink) {
      continue;
    }

    const directProfilePhoto = profileLink.querySelector('[aria-label="Profile photo"] img') as HTMLImageElement | null;
    const directProfilePhotoSrc = extractImageSrc(directProfilePhoto);
    if (directProfilePhotoSrc) {
      return directProfilePhotoSrc;
    }

    const firstMatchingImage = Array.from(profileLink.querySelectorAll('img')).find(
      (img): img is HTMLImageElement => img instanceof HTMLImageElement && Boolean(extractImageSrc(img))
    );
    const firstMatchingImageSrc = extractImageSrc(firstMatchingImage || null);
    if (firstMatchingImageSrc) {
      return firstMatchingImageSrc;
    }
  }

  const explicitSelectors = [
    '[aria-label="Profile photo"] img',
    'a[aria-label="Profile photo"] img',
    'a[href*="/in/"] [aria-label="Profile photo"] img',
    'a[href*="/in/"] img[src*="profile-framedphoto"]',
    'a[href*="/in/"] img[src*="profile-displayphoto"]',
    '.pv-top-card-profile-picture__image--show',
    '.pv-top-card__photo img',
    'img[data-anonymize="headshot-photo"]',
    'img.evi-image',
    'img[alt*="profile photo" i]',
  ];

  for (const selector of explicitSelectors) {
    const candidate = section.querySelector(selector) as HTMLImageElement | null;
    const directSrc = extractImageSrc(candidate);
    if (directSrc) {
      return directSrc;
    }

    if (candidate && isLikelyPrimaryProfileImage(candidate)) {
      return candidate.currentSrc || candidate.src || '';
    }
  }

  const candidates = Array.from(section.querySelectorAll('img'))
    .filter((img): img is HTMLImageElement => img instanceof HTMLImageElement)
    .filter(isLikelyPrimaryProfileImage)
    .sort((a, b) => {
      const areaA = (a.naturalWidth || a.clientWidth || 0) * (a.naturalHeight || a.clientHeight || 0);
      const areaB = (b.naturalWidth || b.clientWidth || 0) * (b.naturalHeight || b.clientHeight || 0);
      return areaB - areaA;
    });

  return candidates[0]?.currentSrc || candidates[0]?.src || '';
}

export function extractProfileData(): ProfileData | null {
  const username = extractUsernameFromUrl();
  if (!username) {
    return null;
  }

  const section = findPrimaryProfileTopCardRoot(username) || findProfileTopCardRoot(username);
  if (!section) {
    return null;
  }

  const displayName = extractProfileDisplayName(section, username);
  if (!displayName) {
    return null;
  }
  const headline = firstNonEmptyText(['.text-body-medium'], section) || extractModernHeadline(section);

  const profileImageUrl = extractPrimaryProfileImage(section, username);

  const location =
    firstNonEmptyText(['.text-body-small.inline.t-black--light.break-words'], section) ||
    extractModernLocation(section);
  const company =
    firstNonEmptyText(
      ['button[aria-label*="Current company" i] span.hoverable-link-text, .pv-top-card--experience-list-item'],
      section
    ) || extractModernCompany(section, displayName, headline, location);

  const connectionDegree = extractConnectionDegree(section);
  const connectionsCount = extractCountBeforeLabel(section, 'connections');
  const followersCount = extractCountBeforeLabel(section, 'followers');
  const memberId = section.getAttribute('data-member-id') || undefined;
  const profileUrn = extractProfileUrnFromPage() || undefined;
  const memberNumericId = extractMemberNumericIdFromPage(section) || memberId;

  return {
    linkedinUrl: `https://www.linkedin.com/in/${username}/`,
    linkedinUsername: username,
    profileUrn,
    memberNumericId,
    displayName,
    headline,
    profileImageUrl,
    company,
    location,
    connectionDegree,
    connectionsCount,
    followersCount,
    memberId,
  };
}
