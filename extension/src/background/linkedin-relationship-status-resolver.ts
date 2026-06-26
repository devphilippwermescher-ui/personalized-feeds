import { normalizeLinkedInUsername } from 'shared/linkedin-identity';
import { GRAPHQL_QUERY_IDS } from '../content/linkedin-relationship-status/constants';
import { parseGraphQLRelationshipStatus } from '../content/linkedin-relationship-status/parsers';
import {
  fetchStatusFromProfilePage,
  fetchUnavailableStatusFromProfilePage,
} from '../content/linkedin-relationship-status/api';
import type { RelationshipResolution } from '../content/linkedin-relationship-status/types';
import { normalizeRelationshipResolution } from '../content/linkedin-relationship-status/utils';
import {
  getLinkedInStatusFetchErrorCode,
  LinkedInStatusFetchError,
} from '../content/linkedin-relationship-status/errors';
import { fetchWithTimeout } from './fetch-with-timeout';
import { getLinkedInCsrfToken } from './profile-viewers-api-client';

const LINKEDIN_RELATIONSHIP_STATUS_REQUEST_TIMEOUT_MS = 20_000;
const LINKEDIN_CONNECT_REQUEST_TIMEOUT_MS = 20_000;
const LINKEDIN_CONNECT_REQUEST_URL =
  'https://www.linkedin.com/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2';

function canBeOverriddenByUnavailableStatus(
  resolution: RelationshipResolution
): boolean {
  return resolution.status !== 'unavailable';
}

function safeEncodeUsername(username: string): string {
  let decoded = username;
  try {
    decoded = decodeURIComponent(username);
  } catch {
    /* keep original */
  }
  return encodeURIComponent(decoded);
}

async function fetchGraphQLRelationshipStatusInBackground(
  username: string,
  queryId: string,
  csrfToken: string
): Promise<RelationshipResolution | null> {
  const url =
    `https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true` +
    `&variables=(vanityName:${safeEncodeUsername(username)})` +
    `&queryId=${queryId}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
      },
    },
    LINKEDIN_RELATIONSHIP_STATUS_REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new LinkedInStatusFetchError(
      `LinkedIn background GraphQL request failed with ${response.status}`,
      getLinkedInStatusFetchErrorCode(response.status),
      response.status
    );
  }

  return parseGraphQLRelationshipStatus(await response.json());
}

export async function resolveLinkedInRelationshipStatusInBackground(
  username: string,
  options: { allowHtmlFallback?: boolean } = {}
): Promise<RelationshipResolution | null> {
  const normalizedUsername = normalizeLinkedInUsername(username);
  if (!normalizedUsername) {
    throw new Error('LinkedIn username is required for background status resolution');
  }

  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new LinkedInStatusFetchError(
      'LinkedIn CSRF token is unavailable. Make sure you are signed in to LinkedIn.',
      'auth_blocked'
    );
  }

  let blockLikeError: unknown = null;
  for (const queryId of GRAPHQL_QUERY_IDS) {
    try {
      const graphQLResult = await fetchGraphQLRelationshipStatusInBackground(
        normalizedUsername,
        queryId,
        csrfToken
      );
      if (graphQLResult) {
        const normalizedGraphQLResult = normalizeRelationshipResolution(graphQLResult);
        if (canBeOverriddenByUnavailableStatus(normalizedGraphQLResult)) {
          const unavailableResult = await fetchUnavailableStatusFromProfilePage(normalizedUsername).catch(() => null);
          if (unavailableResult) {
            return normalizeRelationshipResolution(unavailableResult);
          }
        }

        return normalizedGraphQLResult;
      }
    } catch (error) {
      blockLikeError = error;
      break;
    }
  }

  if (blockLikeError) {
    throw blockLikeError;
  }

  if (options.allowHtmlFallback === false) {
    return null;
  }

  const htmlFallback = await fetchStatusFromProfilePage(normalizedUsername);
  return htmlFallback ? normalizeRelationshipResolution(htmlFallback) : null;
}

export async function sendLinkedInConnectRequestInBackground(
  profileUrn: string,
  referrerUrl?: string
): Promise<void> {
  const normalizedProfileUrn = profileUrn.trim();
  if (!/^urn:li:fsd_profile:[A-Za-z0-9_-]+$/.test(normalizedProfileUrn)) {
    throw new Error('LinkedIn profile URN is required for background connect request');
  }

  const csrfToken = await getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new LinkedInStatusFetchError(
      'LinkedIn CSRF token is unavailable. Make sure you are signed in to LinkedIn.',
      'auth_blocked'
    );
  }

  const init: RequestInit = {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/vnd.linkedin.normalized+json+2.1',
      'content-type': 'application/json; charset=UTF-8',
      'csrf-token': csrfToken,
      'x-li-deco-include-micro-schema': 'true',
      'x-li-lang': 'en_US',
      'x-li-pem-metadata': 'Voyager - Profile Actions=topcard-primary-connect-action-click,Voyager - Invitations - Actions=invite-send',
      'x-restli-protocol-version': '2.0.0',
    },
    body: JSON.stringify({
      invitee: {
        inviteeUnion: {
          memberProfile: normalizedProfileUrn,
        },
      },
    }),
  };

  if (referrerUrl?.startsWith('https://www.linkedin.com/')) {
    init.referrer = referrerUrl;
  }

  const response = await fetchWithTimeout(
    LINKEDIN_CONNECT_REQUEST_URL,
    init,
    LINKEDIN_CONNECT_REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new LinkedInStatusFetchError(
      `LinkedIn background connect request failed with ${response.status}${body ? ` ${body.slice(0, 500)}` : ''}`,
      getLinkedInStatusFetchErrorCode(response.status),
      response.status
    );
  }
}
