import type { LinkedInTypeaheadPerson } from '../../shared/components/FeedActionModals/FeedActionModals';
import type { LinkedInProfileData } from '../../../../../shared/types';

function getLinkedInCsrfToken(): string {
  const cookieMatch = document.cookie.match(/JSESSIONID="?([^";]+)"?/);
  if (!cookieMatch) {
    return '';
  }

  const token = cookieMatch[1].trim();
  return token.startsWith('ajax:') ? token : `ajax:${token}`;
}

function extractBestVectorImageUrl(source: Record<string, unknown>): string {
  const directVectorImage = source.vectorImage && typeof source.vectorImage === 'object'
    ? (source.vectorImage as Record<string, unknown>)
    : null;
  const nestedProfilePicture =
    source.profilePicture && typeof source.profilePicture === 'object'
      ? (source.profilePicture as Record<string, unknown>)
      : null;
  const nestedDisplayImage =
    nestedProfilePicture?.profilePicture &&
      typeof nestedProfilePicture.profilePicture === 'object'
      ? (nestedProfilePicture.profilePicture as Record<string, unknown>)
      : null;
  const nestedDisplayImageReference =
    nestedDisplayImage?.displayImageReferenceResolutionResult &&
      typeof nestedDisplayImage.displayImageReferenceResolutionResult === 'object'
      ? (nestedDisplayImage.displayImageReferenceResolutionResult as Record<string, unknown>)
      : null;
  const nestedVectorImage =
    nestedDisplayImageReference?.vectorImage &&
      typeof nestedDisplayImageReference.vectorImage === 'object'
      ? (nestedDisplayImageReference.vectorImage as Record<string, unknown>)
      : null;
  const vectorImage = directVectorImage || nestedVectorImage;

  if (!vectorImage) {
    return '';
  }

  const rootUrl = typeof vectorImage.rootUrl === 'string' ? vectorImage.rootUrl : '';
  const artifacts = Array.isArray(vectorImage.artifacts) ? vectorImage.artifacts : [];
  const bestArtifact = artifacts
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))[0];

  const path = typeof bestArtifact?.fileIdentifyingUrlPathSegment === 'string'
    ? bestArtifact.fileIdentifyingUrlPathSegment
    : '';

  return rootUrl && path ? `${rootUrl}${path}` : '';
}

function imageSourceMatchesProfile(
  source: Record<string, unknown>,
  targetProfileUrn: string,
  targetUsername: string
): boolean {
  const normalizedTargetUrn = targetProfileUrn.trim();
  const normalizedTargetUsername = targetUsername.trim().toLowerCase();
  const directEntityUrn = typeof source.entityUrn === 'string' ? source.entityUrn.trim() : '';
  const nestedProfile =
    source.profilePicture && typeof source.profilePicture === 'object'
      ? (source.profilePicture as Record<string, unknown>)
      : null;
  const nestedEntityUrn = typeof nestedProfile?.entityUrn === 'string'
    ? nestedProfile.entityUrn.trim()
    : '';
  const nestedPublicIdentifier = typeof nestedProfile?.publicIdentifier === 'string'
    ? nestedProfile.publicIdentifier.trim().toLowerCase()
    : '';

  if (normalizedTargetUrn && (directEntityUrn === normalizedTargetUrn || nestedEntityUrn === normalizedTargetUrn)) {
    return true;
  }

  if (normalizedTargetUsername && nestedPublicIdentifier === normalizedTargetUsername) {
    return true;
  }

  return false;
}

function buildLinkedInImageUrl(
  imageData: Record<string, unknown> | null,
  targetProfileUrn: string,
  targetUsername: string
): string {
  if (!imageData) {
    return '';
  }

  const attributes = Array.isArray(imageData.attributes) ? imageData.attributes : [];
  const fallbackUrls: string[] = [];

  for (const rawAttribute of attributes) {
    const attribute = rawAttribute && typeof rawAttribute === 'object' ? (rawAttribute as Record<string, unknown>) : null;
    const detailData = attribute?.detailData && typeof attribute.detailData === 'object'
      ? (attribute.detailData as Record<string, unknown>)
      : null;

    const candidateSources = [
      detailData?.nonEntityProfilePicture,
      detailData?.profilePicture,
      detailData?.profilePictureWithoutFrame,
      detailData?.profilePictureWithRingStatus,
    ];

    for (const source of candidateSources) {
      if (!source || typeof source !== 'object') {
        continue;
      }

      const imageSource = source as Record<string, unknown>;
      const imageUrl = extractBestVectorImageUrl(imageSource);
      if (!imageUrl) {
        continue;
      }

      if (imageSourceMatchesProfile(imageSource, targetProfileUrn, targetUsername)) {
        return imageUrl;
      }

      fallbackUrls.push(imageUrl);
    }
  }

  return fallbackUrls[0] || '';
}

function parseTypeaheadPersonResult(item: Record<string, unknown>): LinkedInTypeaheadPerson | null {
  const target = item.target && typeof item.target === 'object' ? (item.target as Record<string, unknown>) : null;
  const profileUrn = typeof target?.['*profile'] === 'string' ? (target['*profile'] as string) : '';
  const navigationUrl = typeof item.navigationUrl === 'string' ? item.navigationUrl : '';
  const trackingUrn = typeof item.trackingUrn === 'string' ? item.trackingUrn.trim() : '';

  if (!profileUrn || !navigationUrl.includes('/in/')) {
    return null;
  }

  const title = item.title && typeof item.title === 'object' ? (item.title as Record<string, unknown>) : null;
  const subtitle = item.subtitle && typeof item.subtitle === 'object' ? (item.subtitle as Record<string, unknown>) : null;
  const displayName = typeof title?.text === 'string' ? title.text.trim() : '';
  const subtitleText = typeof subtitle?.text === 'string' ? subtitle.text.trim() : '';

  if (!displayName) {
    return null;
  }

  const [prefix, ...rest] = subtitleText.split('•').map((part) => part.trim()).filter(Boolean);
  const connectionDegree = prefix && /^(\d(?:st|nd|rd)|3rd\+|2nd|1st)/i.test(prefix) ? prefix : '';
  const headline = connectionDegree ? rest.join(' • ') : subtitleText;

  const absoluteUrl = navigationUrl.startsWith('http')
    ? navigationUrl
    : `https://www.linkedin.com${navigationUrl.startsWith('/') ? navigationUrl : `/${navigationUrl}`}`;
  const url = new URL(absoluteUrl);
  const username = decodeURIComponent(url.pathname.replace(/^\/in\//, '').replace(/\/$/, ''));
  const memberNumericIdMatch = trackingUrn.match(/urn:li:(?:fsd_)?member:(\d+)/i);
  const memberNumericId = memberNumericIdMatch?.[1] || '';
  const profileImageUrl = buildLinkedInImageUrl(
    item.image && typeof item.image === 'object' ? (item.image as Record<string, unknown>) : null,
    profileUrn,
    username
  );

  return {
    id: profileUrn,
    displayName,
    headline,
    connectionDegree,
    linkedinUrl: absoluteUrl,
    linkedinUsername: username,
    profileUrn,
    memberNumericId,
    profileImageUrl,
  };
}

export async function searchLinkedInPeople(query: string): Promise<LinkedInTypeaheadPerson[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    return [];
  }

  const variables = `(keywords:${encodeURIComponent(trimmedQuery)})`;
  const response = await fetch(
    `https://www.linkedin.com/voyager/api/graphql?variables=${variables}&queryId=voyagerSearchDashSharing.4e26d0f2284baec4fa3fe92c090494cd`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': getLinkedInCsrfToken(),
        'x-restli-protocol-version': '2.0.0',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`LinkedIn search failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const elements =
    (((payload.data as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)
      ?.searchDashSharingByBlended as Record<string, unknown> | undefined)?.elements;

  if (!Array.isArray(elements)) {
    return [];
  }

  const seen = new Set<string>();
  return elements
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(parseTypeaheadPersonResult)
    .filter((item): item is LinkedInTypeaheadPerson => {
      if (!item || !item.linkedinUsername || seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
}

export function toLinkedInProfileData(person: LinkedInTypeaheadPerson): LinkedInProfileData {
  return {
    linkedinUrl: person.linkedinUrl,
    linkedinUsername: person.linkedinUsername,
    profileUrn: person.profileUrn,
    memberNumericId: person.memberNumericId,
    displayName: person.displayName,
    headline: person.headline,
    profileImageUrl: person.profileImageUrl,
    connectionDegree: person.connectionDegree,
  };
}
