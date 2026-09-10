import type { ProfileViewer } from 'shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  findLinkedInPeopleSearchResultByUsername: vi.fn(),
  getLinkedInCsrfToken: vi.fn(),
}));

vi.mock('../../../shared/async/fetch-with-timeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}));

vi.mock('../profile-viewers-api-client', () => ({
  getLinkedInCsrfToken: mocks.getLinkedInCsrfToken,
}));

vi.mock('shared/linkedin-people-search', () => ({
  findLinkedInPeopleSearchResultByUsername: mocks.findLinkedInPeopleSearchResultByUsername,
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

  it('revalidates a plausible neighbouring name even when RSC marked it as certain', async () => {
    mocks.findLinkedInPeopleSearchResultByUsername.mockReturnValue(null);
    mocks.fetchWithTimeout.mockImplementation(async (url: string) => {
      if (url.includes('/voyager/api/graphql')) {
        return {
          ok: true,
          json: async () => ({}),
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () => `
          <meta property="og:title" content="Rostyslav Osinchuk | LinkedIn">
          <meta property="og:image" content="https://media.licdn.com/dms/image/v2/rostyslav/profile-displayphoto-shrink_100_100/photo?e=4102444800">
        `,
      };
    });

    const result = await enrichVisibleProfileViewers(
      [
        {
          linkedinUrl: 'https://www.linkedin.com/in/rostyslav-osinchuk/',
          linkedinUsername: 'rostyslav-osinchuk',
          displayName: 'Lilia Ustimova',
          profileImageUrl:
            'https://media.licdn.com/dms/image/v2/rostyslav/profile-displayphoto-shrink_100_100/photo?e=4102444800',
          identityUncertain: false,
        },
      ],
      [],
      { verifyEveryIdentity: true }
    );

    expect(String(mocks.fetchWithTimeout.mock.calls[0]?.[0])).toContain('variables=(keywords:rostyslav-osinchuk)');
    expect(result.viewers[0]).toMatchObject({
      linkedinUsername: 'rostyslav-osinchuk',
      displayName: 'Rostyslav Osinchuk',
      identityUncertain: false,
    });
  });

  it('keeps an opaque username unresolved when the exact page redirects to another public identifier', async () => {
    mocks.findLinkedInPeopleSearchResultByUsername.mockReturnValue(null);
    mocks.fetchWithTimeout.mockImplementation(async (url: string) => {
      if (url.includes('/voyager/api/graphql')) {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        url: 'https://www.linkedin.com/in/volodymyr-korol/',
        text: async () => `
          <meta property="og:url" content="https://www.linkedin.com/in/volodymyr-korol/">
          <meta property="og:title" content="Volodymyr Korol | LinkedIn">
        `,
      };
    });

    const result = await enrichVisibleProfileViewers(
      [
        {
          linkedinUrl: 'https://www.linkedin.com/in/rossor/',
          linkedinUsername: 'rossor',
          displayName: 'Rostyslav Osinchuk',
          profileImageUrl: '',
          identityUncertain: true,
        },
      ],
      []
    );

    expect(result.viewers[0]).toMatchObject({
      linkedinUsername: 'rossor',
      linkedinUrl: 'https://www.linkedin.com/in/rossor/',
      displayName: 'Rostyslav Osinchuk',
      identityUncertain: true,
    });
    expect(result.diagnostics[0].rejectionReason).toBe('profile_page_identifier_mismatch');
  });
});
