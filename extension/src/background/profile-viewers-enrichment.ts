import type { ProfileViewer, ProfileViewerInput } from 'shared/types';
import { getUsernameFromLinkedInUrl } from 'shared/linkedin-identity';
import {
  chooseProfileViewerDisplayName,
  chooseProfileViewerImageUrl,
  isUsableLinkedInProfileImageUrl,
  namesLikelyReferToSameProfile,
  profileViewerDisplayNameConflictsWithUsername,
} from 'shared/profile-viewer-quality';
import { hasExplicitProfileViewerPremiumSignal } from './profile-viewers-premium';

export interface ProfileViewerPageMetadata {
  displayName: string;
  profileImageUrl: string;
  isPremium?: boolean;
  linkedinUsername?: string;
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
  const metadata: ProfileViewerPageMetadata = {
    displayName: extractDisplayName(html),
    profileImageUrl: extractProfileImageUrl(html),
    isPremium: hasExplicitProfileViewerPremiumSignal(html) || undefined,
  };
  const linkedinUsername = getUsernameFromLinkedInUrl(extractMetaContent(html, 'og:url'));
  if (linkedinUsername) metadata.linkedinUsername = linkedinUsername;
  return metadata;
}

export function mergeProfileViewerWithPageMetadata(
  viewer: ProfileViewerInput,
  metadata: ProfileViewerPageMetadata,
  existing?: Partial<ProfileViewer>
): ProfileViewerInput {
  // An avatar alone proves only the image. It must not turn a display name
  // guessed from a neighbouring RSC entity into a verified identity.
  const metadataIdentityConflicts = profileViewerDisplayNameConflictsWithUsername(
    metadata.displayName,
    viewer.linkedinUsername
  );
  const metadataIdentifierConflicts = Boolean(
    metadata.linkedinUsername &&
      metadata.linkedinUsername.toLowerCase() !== viewer.linkedinUsername.toLowerCase()
  );
  const trustedMetadata = metadataIdentityConflicts || metadataIdentifierConflicts
    ? { ...metadata, displayName: '', profileImageUrl: '' }
    : metadata;
  const hasTrustedDisplayName =
    Boolean(trustedMetadata.displayName) ||
    namesLikelyReferToSameProfile(viewer.displayName, viewer.linkedinUsername);
  const ignoreUnverifiedExistingIdentity = viewer.identityUncertain === true;
  // This metadata was fetched from the viewer's exact /in/<username>/ URL.
  // Prefer it over an RSC display name, because LinkedIn may stream a profile
  // URL beside the previous card's text and avatar.
  const parsedOrMetadataDisplayName = trustedMetadata.displayName
    ? trustedMetadata.displayName
    : viewer.displayName;

  return {
    ...viewer,
    displayName: chooseProfileViewerDisplayName(
      parsedOrMetadataDisplayName,
      ignoreUnverifiedExistingIdentity ? undefined : existing?.displayName,
      viewer.linkedinUsername
    ),
    profileImageUrl: chooseProfileViewerImageUrl(
      trustedMetadata.profileImageUrl || viewer.profileImageUrl,
      ignoreUnverifiedExistingIdentity ? undefined : existing?.profileImageUrl
    ),
    isPremium: trustedMetadata.isPremium === true ? true : viewer.isPremium ?? existing?.isPremium,
    identityUncertain: ignoreUnverifiedExistingIdentity && !hasTrustedDisplayName,
    discardExistingProfileImage:
      viewer.discardExistingProfileImage === true ||
      metadataIdentityConflicts ||
      metadataIdentifierConflicts ||
      undefined,
  };
}
