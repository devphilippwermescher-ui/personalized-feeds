import type { FeedMember, LinkedInProfileData } from './types';

const RESERVED_LINKEDIN_PROFILE_USERNAMES = new Set([
  'me',
  'null',
  'undefined',
  'profile',
  'settings',
]);

export function normalizeLinkedInUsername(value: string | undefined): string {
  const raw = (value || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function isValidLinkedInProfileUsername(value: string | undefined): boolean {
  const username = normalizeLinkedInUsername(value);
  return (
    username.length >= 3 &&
    !RESERVED_LINKEDIN_PROFILE_USERNAMES.has(username) &&
    /^[\p{L}\p{N}_.~-]+$/u.test(username)
  );
}

export function getUsernameFromLinkedInUrl(urlValue: string | undefined): string {
  if (!urlValue) {
    return '';
  }

  try {
    const url = new URL(urlValue, 'https://www.linkedin.com');
    const match = url.pathname.match(/^\/in\/([^/?#]+)/);
    return normalizeLinkedInUsername(match?.[1] || '');
  } catch {
    return '';
  }
}

export function normalizeMemberNumericId(value: string | undefined): string {
  const normalized = (value || '').trim();
  return /^\d+$/.test(normalized) ? normalized : '';
}

export function getCanonicalLinkedInUsername(value: Pick<LinkedInProfileData, 'linkedinUsername' | 'linkedinUrl'>): string {
  const urlUsername = getUsernameFromLinkedInUrl(value.linkedinUrl);
  if (urlUsername) {
    return urlUsername;
  }

  return normalizeLinkedInUsername(value.linkedinUsername);
}

export function extractProfileToken(profileUrn: string | undefined): string {
  const trimmed = (profileUrn || '').trim();
  if (!trimmed) {
    return '';
  }

  if (/^ACo[A-Za-z0-9_-]+$/i.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/i);
  return match?.[1] || '';
}

export function memberMatchesProfileIdentity(
  member: Pick<FeedMember, 'linkedinUsername' | 'linkedinUrl' | 'memberNumericId' | 'profileUrn'>,
  profile: Pick<LinkedInProfileData, 'linkedinUsername' | 'linkedinUrl' | 'memberNumericId' | 'profileUrn'>
): boolean {
  const memberUsername = getCanonicalLinkedInUsername(member);
  const memberUrlUsername = getUsernameFromLinkedInUrl(member.linkedinUrl);
  const profileUsername = getCanonicalLinkedInUsername(profile);
  const profileUrlUsername = getUsernameFromLinkedInUrl(profile.linkedinUrl);

  const usernameMatch = Boolean(
    (profileUsername && (memberUsername === profileUsername || memberUrlUsername === profileUsername)) ||
      (profileUrlUsername && (memberUsername === profileUrlUsername || memberUrlUsername === profileUrlUsername))
  );

  const memberId = normalizeMemberNumericId(member.memberNumericId);
  const profileId = normalizeMemberNumericId(profile.memberNumericId);
  const numericIdMatch = Boolean(memberId && profileId && memberId === profileId);

  const memberProfileToken = extractProfileToken(member.profileUrn);
  const profileToken = extractProfileToken(profile.profileUrn);
  const profileUrnMatch = Boolean(memberProfileToken && profileToken && memberProfileToken === profileToken);

  return usernameMatch || numericIdMatch || profileUrnMatch;
}

export function buildMemberUpsertPatch(
  existing: Pick<
    FeedMember,
    | 'linkedinUrl'
    | 'linkedinUsername'
    | 'profileUrn'
    | 'memberNumericId'
    | 'displayName'
    | 'headline'
    | 'profileImageUrl'
    | 'company'
    | 'location'
    | 'connectionDegree'
    | 'canMessage'
    | 'canFollow'
    | 'canConnect'
    | 'isFollowing'
  >,
  profileData: LinkedInProfileData
): Partial<FeedMember> {
  const patch: Partial<FeedMember> = {};

  if (profileData.linkedinUrl && profileData.linkedinUrl !== existing.linkedinUrl) {
    patch.linkedinUrl = profileData.linkedinUrl;
  }
  const normalizedExistingUsername = getCanonicalLinkedInUsername(existing);
  const normalizedIncomingUsername = getCanonicalLinkedInUsername(profileData);
  if (normalizedIncomingUsername && normalizedIncomingUsername !== normalizedExistingUsername) {
    patch.linkedinUsername = normalizedIncomingUsername;
  }
  if (profileData.profileUrn && extractProfileToken(profileData.profileUrn) !== extractProfileToken(existing.profileUrn)) {
    patch.profileUrn = profileData.profileUrn;
  }
  if (normalizeMemberNumericId(profileData.memberNumericId) && normalizeMemberNumericId(profileData.memberNumericId) !== normalizeMemberNumericId(existing.memberNumericId)) {
    patch.memberNumericId = normalizeMemberNumericId(profileData.memberNumericId);
  }
  if (profileData.displayName && profileData.displayName !== existing.displayName) {
    patch.displayName = profileData.displayName;
  }
  if (profileData.headline && profileData.headline !== existing.headline) {
    patch.headline = profileData.headline;
  }
  if (profileData.profileImageUrl && profileData.profileImageUrl !== existing.profileImageUrl) {
    patch.profileImageUrl = profileData.profileImageUrl;
  }
  if (profileData.company && profileData.company !== existing.company) {
    patch.company = profileData.company;
  }
  if (profileData.location && profileData.location !== existing.location) {
    patch.location = profileData.location;
  }
  if (profileData.connectionDegree && profileData.connectionDegree !== existing.connectionDegree) {
    patch.connectionDegree = profileData.connectionDegree;
  }
  if (typeof profileData.canMessage === 'boolean' && profileData.canMessage !== existing.canMessage) {
    patch.canMessage = profileData.canMessage;
  }
  if (typeof profileData.canFollow === 'boolean' && profileData.canFollow !== existing.canFollow) {
    patch.canFollow = profileData.canFollow;
  }
  if (typeof profileData.canConnect === 'boolean' && profileData.canConnect !== existing.canConnect) {
    patch.canConnect = profileData.canConnect;
  }
  if (typeof profileData.isFollowing === 'boolean' && profileData.isFollowing !== existing.isFollowing) {
    patch.isFollowing = profileData.isFollowing;
  }

  return patch;
}
