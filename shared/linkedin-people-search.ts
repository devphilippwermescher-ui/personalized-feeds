import type { LinkedInProfileData } from './types';

export interface LinkedInPeopleSearchResult extends LinkedInProfileData {
  id: string;
  headline: string;
  connectionDegree: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function extractBestVectorImageUrl(source: Record<string, unknown>): string {
  const directVectorImage = asRecord(source.vectorImage);
  const nestedProfilePicture = asRecord(source.profilePicture);
  const nestedDisplayImage = asRecord(nestedProfilePicture?.profilePicture);
  const nestedDisplayImageReference = asRecord(
    nestedDisplayImage?.displayImageReferenceResolutionResult
  );
  const vectorImage = directVectorImage || asRecord(nestedDisplayImageReference?.vectorImage);
  if (!vectorImage) {
    return '';
  }

  const rootUrl = typeof vectorImage.rootUrl === 'string' ? vectorImage.rootUrl : '';
  const artifacts = Array.isArray(vectorImage.artifacts) ? vectorImage.artifacts : [];
  const bestArtifact = artifacts
    .map(asRecord)
    .filter((artifact): artifact is Record<string, unknown> => Boolean(artifact))
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))[0];
  const path =
    typeof bestArtifact?.fileIdentifyingUrlPathSegment === 'string'
      ? bestArtifact.fileIdentifyingUrlPathSegment
      : '';

  return rootUrl && path ? `${rootUrl}${path}` : '';
}

function imageSourceMatchesProfile(
  source: Record<string, unknown>,
  targetProfileUrn: string,
  targetUsername: string
): boolean {
  const nestedProfile = asRecord(source.profilePicture);
  const directEntityUrn = typeof source.entityUrn === 'string' ? source.entityUrn.trim() : '';
  const nestedEntityUrn =
    typeof nestedProfile?.entityUrn === 'string' ? nestedProfile.entityUrn.trim() : '';
  const nestedPublicIdentifier =
    typeof nestedProfile?.publicIdentifier === 'string'
      ? nestedProfile.publicIdentifier.trim().toLowerCase()
      : '';

  return Boolean(
    (targetProfileUrn &&
      (directEntityUrn === targetProfileUrn || nestedEntityUrn === targetProfileUrn)) ||
      (targetUsername && nestedPublicIdentifier === targetUsername.toLowerCase())
  );
}

function buildLinkedInImageUrl(
  imageData: Record<string, unknown> | null,
  targetProfileUrn: string,
  targetUsername: string
): string {
  const attributes = Array.isArray(imageData?.attributes) ? imageData.attributes : [];
  const fallbackUrls: string[] = [];

  for (const rawAttribute of attributes) {
    const detailData = asRecord(asRecord(rawAttribute)?.detailData);
    const candidateSources = [
      detailData?.nonEntityProfilePicture,
      detailData?.profilePicture,
      detailData?.profilePictureWithoutFrame,
      detailData?.profilePictureWithRingStatus,
    ];

    for (const rawSource of candidateSources) {
      const source = asRecord(rawSource);
      if (!source) {
        continue;
      }

      const imageUrl = extractBestVectorImageUrl(source);
      if (!imageUrl) {
        continue;
      }

      if (imageSourceMatchesProfile(source, targetProfileUrn, targetUsername)) {
        return imageUrl;
      }

      fallbackUrls.push(imageUrl);
    }
  }

  return fallbackUrls[0] || '';
}

function parsePerson(item: Record<string, unknown>): LinkedInPeopleSearchResult | null {
  const target = asRecord(item.target);
  const profileUrn = typeof target?.['*profile'] === 'string' ? target['*profile'] : '';
  const navigationUrl = typeof item.navigationUrl === 'string' ? item.navigationUrl : '';
  if (!profileUrn || !navigationUrl.includes('/in/')) {
    return null;
  }

  const title = asRecord(item.title);
  const subtitle = asRecord(item.subtitle);
  const displayName = typeof title?.text === 'string' ? title.text.trim() : '';
  const subtitleText = typeof subtitle?.text === 'string' ? subtitle.text.trim() : '';
  if (!displayName) {
    return null;
  }

  const subtitleParts = subtitleText
    .split(/\s*(?:•|·|вЂў)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const connectionDegree =
    subtitleParts[0] && /^(?:1st|2nd|3rd\+?|\d+(?:st|nd|rd|th))$/i.test(subtitleParts[0])
      ? subtitleParts[0]
      : '';
  const headline = connectionDegree ? subtitleParts.slice(1).join(' • ') : subtitleText;
  const absoluteUrl = navigationUrl.startsWith('http')
    ? navigationUrl
    : `https://www.linkedin.com${navigationUrl.startsWith('/') ? navigationUrl : `/${navigationUrl}`}`;
  const url = new URL(absoluteUrl);
  const linkedinUsername = decodeURIComponent(
    url.pathname.replace(/^\/in\//, '').replace(/\/$/, '')
  );
  const trackingUrn = typeof item.trackingUrn === 'string' ? item.trackingUrn.trim() : '';
  const memberNumericId =
    trackingUrn.match(/urn:li:(?:fsd_)?member:(\d+)/i)?.[1] || '';

  return {
    id: profileUrn,
    displayName,
    headline,
    connectionDegree,
    linkedinUrl: absoluteUrl,
    linkedinUsername,
    profileUrn,
    memberNumericId,
    profileImageUrl: buildLinkedInImageUrl(asRecord(item.image), profileUrn, linkedinUsername),
  };
}

export function parseLinkedInPeopleSearchPayload(
  payload: unknown
): LinkedInPeopleSearchResult[] {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const nestedData = asRecord(data?.data);
  const collection = asRecord(nestedData?.searchDashSharingByBlended);
  const elements = Array.isArray(collection?.elements) ? collection.elements : [];
  const seen = new Set<string>();

  return elements
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(parsePerson)
    .filter((person): person is LinkedInPeopleSearchResult => {
      if (!person || !person.linkedinUsername || seen.has(person.id)) {
        return false;
      }
      seen.add(person.id);
      return true;
    });
}

export function findLinkedInPeopleSearchResultByUsername(
  payload: unknown,
  linkedinUsername: string
): LinkedInPeopleSearchResult | null {
  const targetUsername = linkedinUsername.trim().toLowerCase();
  return (
    parseLinkedInPeopleSearchPayload(payload).find(
      (person) => person.linkedinUsername.trim().toLowerCase() === targetUsername
    ) || null
  );
}
