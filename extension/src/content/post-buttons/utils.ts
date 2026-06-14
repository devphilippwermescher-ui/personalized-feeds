import type { PostAuthorProfile } from './types';

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function getLinkedInUsernameFromUrl(urlValue: string): string {
  try {
    const url = new URL(urlValue, window.location.origin);
    const match = url.pathname.match(/^\/in\/([^/?#]+)/);
    return match?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

function findVisibleText(element: ParentNode | null, selectors: string[]): string {
  for (const selector of selectors) {
    const node = element?.querySelector(selector);
    const text = node?.textContent?.trim();
    if (text) {
      return text;
    }
  }

  return '';
}

function findFirstBySelectorPriority<T extends Element>(
  element: ParentNode,
  selectors: string[]
): T | null {
  for (const selector of selectors) {
    const match = element.querySelector<T>(selector);
    if (match) {
      return match;
    }
  }

  return null;
}

function isSocialContextLink(link: HTMLAnchorElement): boolean {
  if (link.closest('.update-components-header, .feed-shared-contextual-header, .update-components-context')) {
    return true;
  }

  const contextText = findNearestTextBlock(link)?.toLowerCase() || '';
  return /\b(likes this|liked this|finds this funny|supports this|loves this|celebrates this|reposted this|shared this|commented on this)\b/.test(contextText);
}

function scoreAuthorLink(link: HTMLAnchorElement): number {
  let score = 0;

  if (link.matches('.update-components-actor__meta-link, .feed-shared-actor__meta-link')) {
    score += 100;
  }
  if (link.matches('.update-components-actor__image, .feed-shared-actor__container-link')) {
    score += 90;
  }
  if (link.closest('.update-components-actor, .feed-shared-actor')) {
    score += 70;
  }
  if (link.querySelector('.update-components-actor__title, .feed-shared-actor__name')) {
    score += 50;
  }
  if (/^view .+ profile$/i.test(link.getAttribute('aria-label') || '')) {
    score += 30;
  }
  if (isSocialContextLink(link)) {
    score -= 200;
  }

  return score;
}

function findPostAuthorLink(post: HTMLElement): HTMLAnchorElement | null {
  const prioritized = findFirstBySelectorPriority<HTMLAnchorElement>(post, [
    '.update-components-actor__meta-link[href*="/in/"]',
    '.update-components-actor__image[href*="/in/"]',
    '.feed-shared-actor__meta-link[href*="/in/"]',
    '.feed-shared-actor__container-link[href*="/in/"]',
    '.update-components-actor a[href*="/in/"]',
    '.feed-shared-actor a[href*="/in/"]',
    '[data-control-name="actor"][href*="/in/"]',
  ]);
  if (prioritized) {
    return prioritized;
  }

  return Array.from(post.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'))
    .filter((link) => !isSocialContextLink(link))
    .map((link) => ({ link, score: scoreAuthorLink(link) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0]?.link || null;
}

function findNearestTextBlock(element: HTMLElement): string {
  let current: HTMLElement | null = element;
  while (current && current.parentElement) {
    const text = current.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (text.length >= 3) {
      return text;
    }
    current = current.parentElement;
  }

  return '';
}

function findModernSocialBoundary(post: HTMLElement): Element | null {
  const separators = Array.from(post.querySelectorAll('hr,[role="presentation"]'));
  return separators.find((separator) => {
    const previousText = collectPreviousSiblingText(separator);
    return /\b(likes this|liked this|finds this funny|supports this|loves this|celebrates this|reposted this|shared this|commented on this)\b/i.test(previousText);
  }) || null;
}

function isPostComposer(element: HTMLElement): boolean {
  const componentKey = element.getAttribute('componentkey') || '';
  if (/sharebox/i.test(componentKey)) {
    return true;
  }

  const label = element.getAttribute('aria-label') || '';
  const text = element.textContent?.replace(/\s+/g, ' ').trim() || '';
  return /^Start a post$/i.test(label) || /\bStart a post\b/.test(text);
}

function collectPreviousSiblingText(element: Element): string {
  const parts: string[] = [];
  let current = element.previousElementSibling;
  while (current) {
    parts.unshift(current.textContent?.replace(/\s+/g, ' ').trim() || '');
    current = current.previousElementSibling;
  }

  const parent = element.parentElement;
  if (parent && parts.join(' ').length < 10) {
    let sibling = parent.previousElementSibling;
    while (sibling) {
      parts.unshift(sibling.textContent?.replace(/\s+/g, ' ').trim() || '');
      sibling = sibling.previousElementSibling;
    }
  }

  return parts.join(' ');
}

function findModernSduiAuthorLink(post: HTMLElement): HTMLAnchorElement | null {
  const socialBoundary = findModernSocialBoundary(post);
  const links = Array.from(post.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'));
  const actorLinks = socialBoundary
    ? links.filter((link) => socialBoundary.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING)
    : links;

  return actorLinks
    .filter((link) => !isSocialContextLink(link))
    .map((link) => ({ link, score: scoreModernAuthorLink(link) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0]?.link || null;
}

function scoreModernAuthorLink(link: HTMLAnchorElement): number {
  let score = 0;
  const text = link.textContent?.replace(/\s+/g, ' ').trim() || '';
  const ariaLabel = link.getAttribute('aria-label') || '';

  if (link.querySelector('[aria-label*="1st"], [aria-label*="2nd"], [aria-label*="3rd"]')) {
    score += 90;
  }
  if (link.querySelector('[aria-label*="Profile"], [aria-label*="Following"]')) {
    score += 80;
  }
  if (/[•]\s*(1st|2nd|3rd)\b/i.test(text) || /\b(1st|2nd|3rd)\b/.test(ariaLabel)) {
    score += 70;
  }
  if (/^view .+(?:’s|'s)? profile$/i.test(ariaLabel)) {
    score += 35;
  }
  if (link.querySelector('img, svg')) {
    score += 10;
  }
  if (isSocialContextLink(link)) {
    score -= 200;
  }

  return score;
}

function findBestPostAuthorLink(post: HTMLElement): HTMLAnchorElement | null {
  return findModernSduiAuthorLink(post) || findPostAuthorLink(post);
}

function cleanProfileName(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^View\s+/i, '')
    .replace(/,\s*(?:open to work|hiring).*$/i, '')
    .replace(/(?:’s|'s)?\s+profile$/i, '')
    .replace(/\s+(?:Premium|Verified)\s+Profile\b.*$/i, '')
    .replace(/\s+Profile\s+(?:Following|1st|2nd|3rd\+?|3rd)\b.*$/i, '')
    .replace(/\s+[•·]\s*(?:1st|2nd|3rd)\b.*$/i, '')
    .replace(/\s+[•·]\s*(?:Following|Connect|Follow)\b.*$/i, '')
    .replace(/\s+(?:1st|2nd|3rd)\b.*$/i, '')
    .replace(/\s+(?:Following|Connect|Follow)\b.*$/i, '')
    .trim();
}

function getDisplayNameFromAuthorLink(link: HTMLAnchorElement): string {
  const ariaLabel = cleanProfileName(link.getAttribute('aria-label') || '');
  if (ariaLabel && !/^view$/i.test(ariaLabel)) {
    return ariaLabel;
  }

  const labelledElement = link.querySelector<HTMLElement>('[aria-label*="1st"], [aria-label*="2nd"], [aria-label*="3rd"]');
  const labelledName = cleanProfileName(labelledElement?.getAttribute('aria-label') || '');
  if (labelledName) {
    return labelledName;
  }

  return cleanProfileName(link.textContent || '');
}

function findProfileImageUrlForAuthor(post: HTMLElement, actorLink: HTMLAnchorElement): string {
  const directImage = actorLink.querySelector<HTMLImageElement>('img')?.src;
  if (directImage) {
    return directImage;
  }

  const matchingProfileImage = Array.from(post.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'))
    .find((link) => link.href === actorLink.href)
    ?.querySelector<HTMLImageElement>('img')?.src;
  if (matchingProfileImage) {
    return matchingProfileImage;
  }

  return findFirstBySelectorPriority<HTMLImageElement>(post, [
    '.update-components-actor__avatar-image',
    '.feed-shared-actor__avatar-image',
    '.update-components-actor img.EntityPhoto-circle-3',
    '.feed-shared-actor img.EntityPhoto-circle-3',
    'a[aria-label^="View "][href*="/in/"] img',
  ])?.src || '';
}

function findModernSduiPostMetaHost(post: HTMLElement): HTMLElement | null {
  const actorLink = findBestPostAuthorLink(post);
  if (!actorLink) {
    return null;
  }

  const iconHost = Array.from(post.querySelectorAll<SVGElement>('svg[aria-label*="Visibility"], svg[aria-label*="Global"], svg[id*="globe"]'))
    .filter((icon) => actorLink.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING)
    .map((icon) => icon.parentElement)
    .find((host): host is HTMLElement => {
      const text = host?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return /\b\d+\s*(?:s|m|h|d|w|mo|yr)\b/i.test(text);
    }) || null;
  if (iconHost) {
    return iconHost;
  }

  return Array.from(post.querySelectorAll<HTMLElement>('p span, p'))
    .filter((element) => actorLink.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
    .find((element) => {
      const text = element.textContent?.replace(/\s+/g, ' ').trim() || '';
      return /^\d+\s*(?:s|m|h|d|w|mo|yr)\b(?:\s*[•·]|$)/i.test(text);
    }) || null;
}

export function findPostAuthorDrawerHost(post: HTMLElement): HTMLElement | null {
  const legacyHost = post.querySelector<HTMLElement>(
    '.update-components-actor__sub-description, .update-components-actor__meta, .feed-shared-actor__sub-description, .feed-shared-actor__meta'
  );
  if (legacyHost) {
    return legacyHost;
  }

  return findModernSduiPostMetaHost(post);
}

function findPostCardRoot(element: HTMLElement): HTMLElement {
  let current: HTMLElement = element;
  let depth = 0;

  while (current.parentElement && depth < 4) {
    const parent = current.parentElement;
    if (
      parent.getAttribute('data-display-contents') === 'true' &&
      !isPostComposer(parent) &&
      parent.querySelector('[role="listitem"][componentkey*="FeedType_"]')
    ) {
      current = parent;
      depth += 1;
      continue;
    }
    break;
  }

  return current;
}

function addPostCandidate(candidates: Set<HTMLElement>, candidate: HTMLElement): void {
  if (isPostComposer(candidate)) {
    return;
  }

  const hasPostSignal =
    candidate.matches('[role="listitem"][componentkey*="FeedType_"]') ||
    Boolean(candidate.querySelector('[role="listitem"][componentkey*="FeedType_"]')) ||
    Boolean(candidate.querySelector('[data-testid="expandable-text-box"]'));

  if (hasPostSignal && candidate.querySelector('a[href*="/in/"]')) {
    candidates.add(candidate);
  }
}

export function findPostCandidates(root: ParentNode = document): HTMLElement[] {
  const candidates = new Set<HTMLElement>();
  root.querySelectorAll<HTMLElement>(
    '.feed-shared-update-v2[role="article"], .feed-shared-update-v2[data-urn]'
  ).forEach((post) => addPostCandidate(candidates, post));

  const feedRoots = Array.from(root.querySelectorAll<HTMLElement>(
    '[data-testid="mainFeed"][role="list"]'
  ));
  if (root instanceof HTMLElement && root.matches('[data-testid="mainFeed"][role="list"]')) {
    feedRoots.unshift(root);
  }

  feedRoots.forEach((feedRoot) => {
    Array.from(feedRoot.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) {
        return;
      }

      const hasFeedMarker =
        child.getAttribute('componentkey')?.includes('FeedType_') ||
        Boolean(child.querySelector('[componentkey*="FeedType_"]'));
      const hasListItem =
        child.getAttribute('role') === 'listitem' ||
        Boolean(child.querySelector('[role="listitem"]'));
      if (hasFeedMarker && hasListItem) {
        const listItem = child.matches('[role="listitem"][componentkey*="FeedType_"]')
          ? child
          : child.querySelector<HTMLElement>('[role="listitem"][componentkey*="FeedType_"]');
        addPostCandidate(candidates, findPostCardRoot(listItem || child));
      }
    });

    feedRoot.querySelectorAll<HTMLElement>(
      '[role="listitem"][componentkey*="FeedType_"], [componentkey*="FeedType_"] [role="listitem"]'
    ).forEach((post) => addPostCandidate(candidates, findPostCardRoot(post)));
  });

  const shouldUseSduiFallback =
    root === document &&
    window.location.pathname.startsWith('/feed') &&
    feedRoots.length === 0;
  if (shouldUseSduiFallback) {
    root.querySelectorAll<HTMLElement>('[role="listitem"][componentkey*="FeedType_"]').forEach((post) => {
      if (post.querySelector('a[href*="/in/"], [data-testid="expandable-text-box"]')) {
        addPostCandidate(candidates, findPostCardRoot(post));
      }
    });
  }

  return Array.from(candidates);
}

export function extractPostAuthorProfile(post: HTMLElement): PostAuthorProfile | null {
  const actorLink = findBestPostAuthorLink(post);
  if (!actorLink) {
    return null;
  }

  const linkedinUrl = actorLink.href.trim();
  const linkedinUsername = getLinkedInUsernameFromUrl(linkedinUrl);
  if (!linkedinUrl || !linkedinUsername) {
    return null;
  }

  const displayName = findVisibleText(post, [
    '.update-components-actor__title [aria-hidden="true"]',
    '.update-components-actor__title',
    '.feed-shared-actor__name [aria-hidden="true"]',
    '.feed-shared-actor__name',
    '.update-components-actor__meta-link',
  ]) || getDisplayNameFromAuthorLink(actorLink);

  if (!displayName) {
    return null;
  }

  const headline = findVisibleText(post, [
    '.update-components-actor__description [aria-hidden="true"]',
    '.update-components-actor__description',
    '.feed-shared-actor__description [aria-hidden="true"]',
    '.feed-shared-actor__description',
  ]);

  const profileImageUrl = findProfileImageUrlForAuthor(post, actorLink);

  return {
    linkedinUrl,
    linkedinUsername,
    displayName,
    headline,
    profileImageUrl,
    postUrn: post.getAttribute('data-urn') || undefined,
  };
}
