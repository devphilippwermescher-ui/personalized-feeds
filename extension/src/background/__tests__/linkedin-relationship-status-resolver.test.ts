import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeout = vi.fn();
const getLinkedInCsrfToken = vi.fn();
const parseGraphQLRelationshipStatus = vi.fn();
const fetchStatusFromProfilePage = vi.fn();
const fetchUnavailableStatusFromProfilePage = vi.fn();

vi.mock('../fetch-with-timeout', () => ({
  fetchWithTimeout,
}));

vi.mock('../profile-viewers-api-client', () => ({
  getLinkedInCsrfToken,
}));

vi.mock('../../content/linkedin-relationship-status/parsers', () => ({
  parseGraphQLRelationshipStatus,
}));

vi.mock('../../content/linkedin-relationship-status/api', () => ({
  fetchStatusFromProfilePage,
  fetchUnavailableStatusFromProfilePage,
}));

describe('resolveLinkedInRelationshipStatusInBackground', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchWithTimeout.mockReset();
    getLinkedInCsrfToken.mockReset();
    parseGraphQLRelationshipStatus.mockReset();
    fetchStatusFromProfilePage.mockReset();
    fetchUnavailableStatusFromProfilePage.mockReset();

    getLinkedInCsrfToken.mockResolvedValue('ajax:test');
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  it('returns unavailable when GraphQL says connect but profile page is deleted', async () => {
    parseGraphQLRelationshipStatus.mockReturnValue({
      status: 'connect',
      canConnect: true,
      canFollow: true,
      isFollowing: false,
    });
    fetchUnavailableStatusFromProfilePage.mockResolvedValue({
      status: 'unavailable',
      canConnect: false,
      canFollow: false,
      canMessage: false,
      isFollowing: false,
    });

    const { resolveLinkedInRelationshipStatusInBackground } = await import('../linkedin-relationship-status-resolver');
    const result = await resolveLinkedInRelationshipStatusInBackground('deleted-profile');

    expect(fetchUnavailableStatusFromProfilePage).toHaveBeenCalledWith('deleted-profile');
    expect(result).toMatchObject({
      status: 'unavailable',
      canConnect: false,
      canFollow: false,
      canMessage: false,
      isFollowing: false,
    });
  });
});

describe('sendLinkedInConnectRequestInBackground', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchWithTimeout.mockReset();
    getLinkedInCsrfToken.mockReset();
    parseGraphQLRelationshipStatus.mockReset();
    fetchStatusFromProfilePage.mockReset();
    fetchUnavailableStatusFromProfilePage.mockReset();

    getLinkedInCsrfToken.mockResolvedValue('ajax:test');
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      text: async () => '',
    } as Response);
  });

  it('sends the Voyager invitation request with cookies, CSRF, and referrer', async () => {
    const { sendLinkedInConnectRequestInBackground } = await import('../linkedin-relationship-status-resolver');
    await sendLinkedInConnectRequestInBackground(
      'urn:li:fsd_profile:ACoAAConnectBackground',
      'https://www.linkedin.com/in/connect-background/'
    );

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://www.linkedin.com/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        referrer: 'https://www.linkedin.com/in/connect-background/',
        headers: expect.objectContaining({
          accept: 'application/vnd.linkedin.normalized+json+2.1',
          'content-type': 'application/json; charset=UTF-8',
          'csrf-token': 'ajax:test',
          'x-li-deco-include-micro-schema': 'true',
          'x-li-lang': 'en_US',
          'x-li-pem-metadata': 'Voyager - Profile Actions=topcard-primary-connect-action-click,Voyager - Invitations - Actions=invite-send',
          'x-restli-protocol-version': '2.0.0',
        }),
        body: JSON.stringify({
          invitee: {
            inviteeUnion: {
              memberProfile: 'urn:li:fsd_profile:ACoAAConnectBackground',
            },
          },
        }),
      }),
      20_000
    );
  });
});
