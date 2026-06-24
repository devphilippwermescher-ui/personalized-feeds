import type { ProfileViewer, ProfileViewerInput } from 'shared/types';
import {
  chooseProfileViewerDisplayName,
  chooseProfileViewerImageUrl,
  isUsableLinkedInProfileImageUrl,
} from 'shared/profile-viewer-quality';

export interface ProfileViewerPageMetadata {
  displayName: string;
  profileImageUrl: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/');
}

function getTagAttribute(tag: string, attributeName: string): string {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(
    new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
  );
  return decodeHtml(match?.[1] || match?.[2] || '').trim();
}

function extractMetaContent(html: string, property: string): string {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const key = getTagAttribute(tag, 'property') || getTagAttribute(tag, 'name');
    if (key.toLowerCase() === property.toLowerCase()) {
      return getTagAttribute(tag, 'content');
    }
  }

  return '';
}

function cleanProfileTitle(value: string): string {
  return decodeHtml(value)
    .replace(/\s*[|–—-]\s*LinkedIn.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDisplayName(html: string): string {
  const ogTitle = cleanProfileTitle(extractMetaContent(html, 'og:title'));
  if (ogTitle) {
    return ogTitle;
  }

  const firstName = decodeHtml(
    html.match(/\\?"firstName\\?"\s*:\s*\\?"([^"\\]+)\\?"/i)?.[1] || ''
  ).trim();
  const lastName = decodeHtml(
    html.match(/\\?"lastName\\?"\s*:\s*\\?"([^"\\]+)\\?"/i)?.[1] || ''
  ).trim();
  return `${firstName} ${lastName}`.trim();
}

function extractProfileImageUrl(html: string): string {
  const ogImage = extractMetaContent(html, 'og:image');
  if (isUsableLinkedInProfileImageUrl(ogImage)) {
    return ogImage;
  }

  const imageSrcSets = Array.from(html.matchAll(/\b(?:imagesrcset|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi));
  for (const match of imageSrcSets) {
    const srcSet = decodeHtml(match[1] || match[2] || '');
    const candidates = srcSet
      .split(',')
      .map((entry) => entry.trim().split(/\s+/)[0] || '')
      .filter((url) => isUsableLinkedInProfileImageUrl(url));
    if (candidates[0]) {
      return candidates[0];
    }
  }

  const directMatches = decodeHtml(html).match(
    /https:\/\/media\.licdn\.com\/[^"'\\<>\s]+profile-(?:displayphoto|framedphoto)[^"'\\<>\s]+/gi
  ) || [];
  const uniqueDirectMatches = Array.from(
    new Set(directMatches.filter((url) => isUsableLinkedInProfileImageUrl(url)))
  );
  return uniqueDirectMatches.length === 1 ? uniqueDirectMatches[0] : '';
}

export function parseProfileViewerPageMetadata(html: string): ProfileViewerPageMetadata {
  return {
    displayName: extractDisplayName(html),
    profileImageUrl: extractProfileImageUrl(html),
  };
}

export function mergeProfileViewerWithPageMetadata(
  viewer: ProfileViewerInput,
  metadata: ProfileViewerPageMetadata,
  existing?: Partial<ProfileViewer>
): ProfileViewerInput {
  const parsedOrMetadataDisplayName = chooseProfileViewerDisplayName(
    viewer.displayName,
    metadata.displayName,
    viewer.linkedinUsername
  );

  return {
    ...viewer,
    displayName: chooseProfileViewerDisplayName(
      parsedOrMetadataDisplayName,
      existing?.displayName,
      viewer.linkedinUsername
    ),
    profileImageUrl: chooseProfileViewerImageUrl(
      metadata.profileImageUrl || viewer.profileImageUrl,
      existing?.profileImageUrl
    ),
  };
}
