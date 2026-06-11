import type { LinkedInTypeaheadPerson } from '../../shared/components/FeedActionModals/FeedActionModals';
import type { LinkedInProfileData } from '../../../../../shared/types';
import { parseLinkedInPeopleSearchPayload } from '../../../../../shared/linkedin-people-search';

function getLinkedInCsrfToken(): string {
  const cookieMatch = document.cookie.match(/JSESSIONID="?([^";]+)"?/);
  if (!cookieMatch) {
    return '';
  }

  const token = cookieMatch[1].trim();
  return token.startsWith('ajax:') ? token : `ajax:${token}`;
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

  return parseLinkedInPeopleSearchPayload(await response.json());
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
