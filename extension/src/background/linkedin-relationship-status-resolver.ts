import { normalizeLinkedInUsername } from 'shared/linkedin-identity';
import { GRAPHQL_QUERY_IDS } from '../content/linkedin-relationship-status/constants';
import { parseGraphQLRelationshipStatus } from '../content/linkedin-relationship-status/parsers';
import { fetchStatusFromProfilePage } from '../content/linkedin-relationship-status/api';
import type { RelationshipResolution } from '../content/linkedin-relationship-status/types';
import { normalizeRelationshipResolution } from '../content/linkedin-relationship-status/utils';
import {
  getLinkedInStatusFetchErrorCode,
  LinkedInStatusFetchError,
} from '../content/linkedin-relationship-status/errors';
import { fetchWithTimeout } from './fetch-with-timeout';
import { getLinkedInCsrfToken } from './profile-viewers-api-client';

const LINKEDIN_RELATIONSHIP_STATUS_REQUEST_TIMEOUT_MS = 20_000;

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
        return normalizeRelationshipResolution(graphQLResult);
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
