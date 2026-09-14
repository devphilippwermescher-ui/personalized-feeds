import { normalizeLinkedInUsername } from 'shared/linkedin-identity';
import { fetchWithTimeout } from '../../shared/async/fetch-with-timeout';
import { getLinkedInCsrfToken } from './csrf-token';
import { findFirstStringByKey } from './json-utils';

const PROFILE_IDENTITY_QUERY_ID = 'voyagerIdentityDashProfiles.273a499c117721535e6da078bee17e9c';
const PROFILE_IDENTITY_REQUEST_TIMEOUT_MS = 15_000;

type UnknownRecord = Record<string, unknown>;

export interface LinkedInProfileIdentity {
  linkedinUsername: string;
  profileUrn: string;
  displayName?: string;
  location?: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function findProfileIdentity(value: unknown): LinkedInProfileIdentity | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findProfileIdentity(item);
      if (result) return result;
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const linkedinUsername = normalizeLinkedInUsername(getString(value.publicIdentifier));
  const profileUrn = getString(value.entityUrn);
  if (linkedinUsername && /^urn:li:fsd_profile:[A-Za-z0-9_-]+$/.test(profileUrn)) {
    const displayName = `${getString(value.firstName)} ${getString(value.lastName)}`.trim();
    return { linkedinUsername, profileUrn, displayName: displayName || undefined };
  }

  for (const nested of Object.values(value)) {
    const result = findProfileIdentity(nested);
    if (result) return result;
  }

  return null;
}

export function parseLinkedInProfileIdentity(payload: unknown): LinkedInProfileIdentity | null {
  const identity = findProfileIdentity(payload);
  if (!identity) return null;

  const location = findFirstStringByKey(payload, /^(?:geoLocationName|locationName)$/i);
  return { ...identity, location };
}

export async function resolveLinkedInProfileIdentity(username: string): Promise<LinkedInProfileIdentity | null> {
  const linkedinUsername = normalizeLinkedInUsername(username);
  if (!linkedinUsername) {
    return null;
  }

  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new Error('LinkedIn CSRF token is unavailable. Make sure you are signed in to LinkedIn.');
  }

  const url =
    'https://www.linkedin.com/voyager/api/graphql?' +
    `variables=(memberIdentity:${encodeURIComponent(linkedinUsername)})&queryId=${PROFILE_IDENTITY_QUERY_ID}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': csrfToken,
        'x-li-lang': 'en_US',
        'x-restli-protocol-version': '2.0.0',
      },
    },
    PROFILE_IDENTITY_REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`LinkedIn profile identity request returned ${response.status}.`);
  }

  const identity = parseLinkedInProfileIdentity(await response.json());
  console.info('[linkedin-profile] LinkedIn profile identity resolved', {
    linkedinUsername,
    profileUrn: identity?.profileUrn || '',
    location: identity?.location || '',
  });
  return identity;
}
