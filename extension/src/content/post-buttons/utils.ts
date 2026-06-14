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
  return Boolean(link.closest(
    '.update-components-header, .feed-shared-contextual-header, .update-components-context'
  ));
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

function findDirectFeedChild(element: HTMLElement, feedRoot: HTMLElement): HTMLElement {
  let current = element;
  while (current.parentElement && current.parentElement !== feedRoot) {
    current = current.parentElement;
  }
  return current;
}

export function findPostCandidates(root: ParentNode = document): HTMLElement[] {
  const candidates = new Set<HTMLElement>();
  root.querySelectorAll<HTMLElement>(
    '.feed-shared-update-v2[role="article"], .feed-shared-update-v2[data-urn]'
  ).forEach((post) => candidates.add(post));

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
        candidates.add(child);
      }
    });

    feedRoot.querySelectorAll<HTMLElement>(
      '[role="listitem"][componentkey*="FeedType_"], [componentkey*="FeedType_"] [role="listitem"]'
    ).forEach((post) => candidates.add(findDirectFeedChild(post, feedRoot)));
  });

  return Array.from(candidates);
}

export function extractPostAuthorProfile(post: HTMLElement): PostAuthorProfile | null {
  const actorLink = findPostAuthorLink(post);

  const linkedinUrl = actorLink?.href?.trim() || '';
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
  ]);

  if (!displayName) {
    return null;
  }

  const headline = findVisibleText(post, [
    '.update-components-actor__description [aria-hidden="true"]',
    '.update-components-actor__description',
    '.feed-shared-actor__description [aria-hidden="true"]',
    '.feed-shared-actor__description',
  ]);

  const profileImageUrl =
    findFirstBySelectorPriority<HTMLImageElement>(post, [
      '.update-components-actor__avatar-image',
      '.feed-shared-actor__avatar-image',
      '.update-components-actor img.EntityPhoto-circle-3',
      '.feed-shared-actor img.EntityPhoto-circle-3',
      'a[aria-label^="View "][href*="/in/"] img',
    ])?.src || '';

  return {
    linkedinUrl,
    linkedinUsername,
    displayName,
    headline,
    profileImageUrl,
    postUrn: post.getAttribute('data-urn') || undefined,
  };
}
