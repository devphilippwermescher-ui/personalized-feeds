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

export function extractPostAuthorProfile(post: HTMLElement): PostAuthorProfile | null {
  const actorLink = post.querySelector<HTMLAnchorElement>(
    '.update-components-actor__meta-link[href*="/in/"], .update-components-actor__image[href*="/in/"], a[href*="/in/"][data-test-app-aware-link]'
  );

  const linkedinUrl = actorLink?.href?.trim() || '';
  const linkedinUsername = getLinkedInUsernameFromUrl(linkedinUrl);
  if (!linkedinUrl || !linkedinUsername) {
    return null;
  }

  const displayName = findVisibleText(post, [
    '.update-components-actor__title [aria-hidden="true"]',
    '.update-components-actor__title',
    '.update-components-actor__meta-link',
  ]);

  if (!displayName) {
    return null;
  }

  const headline = findVisibleText(post, [
    '.update-components-actor__description [aria-hidden="true"]',
    '.update-components-actor__description',
  ]);

  const profileImageUrl =
    post.querySelector<HTMLImageElement>('.update-components-actor__avatar-image, img.EntityPhoto-circle-3')?.src || '';

  return {
    linkedinUrl,
    linkedinUsername,
    displayName,
    headline,
    profileImageUrl,
    postUrn: post.getAttribute('data-urn') || undefined,
  };
}
