import { normalizeLinkedInProfileImageUrl } from '../../../../shared/linkedin-profile-image';

const PROFILE_IMAGE_SELECTORS = [
  'img.presence-entity__image',
  'img[class*="EntityPhoto"]',
  'img[class*="profile"]',
  'img',
] as const;

const EXTENSION_CONTROL_SELECTOR = [
  '.lfa-messaging-feed-btn-wrapper',
  '.lfa-messaging-drawer-feed-btn-wrapper',
  '.lfa-post-drawer-btn',
].join(', ');

function getImageSource(image: HTMLImageElement): string {
  return image.currentSrc || image.src || image.getAttribute('src') || '';
}

/** Finds a LinkedIn profile photo while excluding images injected by us. */
export function findLinkedInProfileImageUrl(root: ParentNode): string {
  const seen = new Set<HTMLImageElement>();

  for (const selector of PROFILE_IMAGE_SELECTORS) {
    const candidates = root.querySelectorAll<HTMLImageElement>(selector);
    for (const image of candidates) {
      if (seen.has(image)) continue;
      seen.add(image);
      if (image.closest(EXTENSION_CONTROL_SELECTOR)) continue;

      const profileImageUrl = normalizeLinkedInProfileImageUrl(getImageSource(image));
      if (profileImageUrl) return profileImageUrl;
    }
  }

  return '';
}
