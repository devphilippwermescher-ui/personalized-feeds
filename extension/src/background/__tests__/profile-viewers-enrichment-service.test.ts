import type { ProfileViewer } from 'shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  findLinkedInPeopleSearchResultByUsername: vi.fn(),
  getLinkedInCsrfToken: vi.fn(),
}));

vi.mock('../fetch-with-timeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}));

vi.mock('../profile-viewers-api-client', () => ({
  getLinkedInCsrfToken: mocks.getLinkedInCsrfToken,
}));

vi.mock('shared/linkedin-people-search', () => ({
  findLinkedInPeopleSearchResultByUsername:
    mocks.findLinkedInPeopleSearchResultByUsername,
}));

import { enrichVisibleProfileViewers } from '../profile-viewers-enrichment-service';

describe('profile viewer enrichment service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLinkedInCsrfToken.mockResolvedValue('csrf');
  });

  it('does not replace a vanity-matched viewer with a conflicting search or page identity', async () => {
    mocks.findLinkedInPeopleSearchResultByUsername.mockReturnValue({
      id: 'urn:li:fsd_profile:oleksii',
      linkedinUrl: 'https://www.linkedin.com/in/oleksii-vakhniuk-9235412b7/',
      linkedinUsername: 'oleksii-vakhniuk-9235412b7',
      displayName: 'Alina Diachaenko',
      headline: '',
      connectionDegree: '',
      profileImageUrl:
        'https://media.licdn.com/dms/image/v2/alina/profile-displayphoto-shrink_100_100/photo?e=4102444800',
    });
    mocks.fetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => `
          <meta property="og:title" content="Alina Diachaenko | LinkedIn">
          <meta property="og:image" content="https://media.licdn.com/dms/image/v2/alina/profile-displayphoto-shrink_100_100/photo?e=4102444800">
        `,
      });
    const existingViewer = {
      id: 'oleksii-vakhniuk-9235412b7',
      linkedinUrl: 'https://www.linkedin.com/in/oleksii-vakhniuk-9235412b7/',
      linkedinUsername: 'oleksii-vakhniuk-9235412b7',
      displayName: 'Alina Diachaenko',
      profileImageUrl:
        'https://media.licdn.com/dms/image/v2/alina/profile-displayphoto-shrink_100_100/photo?e=4102444800',
      firstSeenAt: 1,
      lastSeenAt: 2,
      source: 'linkedin_profile_views',
    } satisfies ProfileViewer;

    const result = await enrichVisibleProfileViewers(
      [
        {
          linkedinUrl: 'https://www.linkedin.com/in/oleksii-vakhniuk-9235412b7/',
          linkedinUsername: 'oleksii-vakhniuk-9235412b7',
          displayName: 'Oleksii Vakhniuk',
          profileImageUrl: '',
          identityUncertain: true,
        },
      ],
      [existingViewer]
    );

    expect(result.viewers[0]).toMatchObject({
      linkedinUsername: 'oleksii-vakhniuk-9235412b7',
      displayName: 'Oleksii Vakhniuk',
      profileImageUrl: '',
      identityUncertain: false,
      discardExistingProfileImage: true,
    });
  });
});
