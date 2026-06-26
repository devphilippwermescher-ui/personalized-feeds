import type { ProfileData } from '../types';

export function extractUsernameFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/in\/([^/]+)/);
  return match ? match[1] : null;
}

function getProfileHrefCandidates(username: string): string[] {
  return [
    `https://www.linkedin.com/in/${username}/`,
    `https://www.linkedin.com/in/${username}`,
    `/in/${username}/`,
    `/in/${username}`,
  ];
}

function hasModernTopCardSignals(element: Element): boolean {
  return Boolean(
    element.querySelector('h1, h2') &&
      (
        element.querySelector('a[href*="/preload/custom-invite/"]') ||
        element.querySelector('a[href*="/messaging/compose/"]') ||
        element.querySelector('a[href*="/overlay/contact-info/"]')
      )
  );
}

function findModernTopCardByComponentKey(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('section[componentkey*="Topcard"], section[componentkey*="topcard"]')
  );

  for (const candidate of candidates) {
    if (hasModernTopCardSignals(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function findProfileTopCardRoot(username = extractUsernameFromUrl() || ''): HTMLElement | null {
  const legacyRoot =
    document.querySelector<HTMLElement>('section[data-member-id]') ||
    document.querySelector<HTMLElement>('.pv-top-card');
  if (legacyRoot) {
    return legacyRoot;
  }

  const modernComponentRoot = findModernTopCardByComponentKey();
  if (modernComponentRoot) {
    return modernComponentRoot;
  }

  if (!username) {
    return null;
  }

  for (const href of getProfileHrefCandidates(username)) {
    const links = Array.from(document.querySelectorAll(`a[href="${href}"]`));
    for (const link of links) {
      let current: Element | null = link;
      let depth = 0;

      while (current && depth < 10) {
        if (hasModernTopCardSignals(current)) {
          return current as HTMLElement;
        }
        current = current.parentElement;
        depth += 1;
      }
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

function extractConnectionDegree(root: ParentNode): string {
  const explicit = firstNonEmptyText(['.dist-value'], root);
  if (explicit) {
    return explicit;
  }

  const text = root.textContent || '';
  const match = text.match(/(?:^|\u00b7|\s)(1st|2nd|3rd\+?|3rd)(?:$|\s)/i);
  return match?.[1] || '';
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

    const directProfilePhoto =
      profileLink.querySelector('[aria-label="Profile photo"] img') as HTMLImageElement | null;
    const directProfilePhotoSrc = extractImageSrc(directProfilePhoto);
    if (directProfilePhotoSrc) {
      return directProfilePhotoSrc;
    }

    const firstMatchingImage = Array.from(profileLink.querySelectorAll('img'))
      .find((img): img is HTMLImageElement => img instanceof HTMLImageElement && Boolean(extractImageSrc(img)));
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

  const section = findProfileTopCardRoot(username);
  if (!section) {
    return null;
  }

  const displayName = firstNonEmptyText(['h1', 'h2'], section);
  const headline =
    firstNonEmptyText(['.text-body-medium'], section) ||
    extractModernHeadline(section);

  const profileImageUrl = extractPrimaryProfileImage(section, username);

  const company =
    firstNonEmptyText([
      'button[aria-label*="Current company"] span.hoverable-link-text, .pv-top-card--experience-list-item'
    ], section);

  const location =
    firstNonEmptyText(['.text-body-small.inline.t-black--light.break-words'], section) ||
    extractModernLocation(section);

  const connectionDegree = extractConnectionDegree(section);
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
    memberId,
  };
}
