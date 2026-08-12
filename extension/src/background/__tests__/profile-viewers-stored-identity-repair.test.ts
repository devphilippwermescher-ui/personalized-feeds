import type { ProfileViewer } from 'shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveLinkedInProfileIdentity: vi.fn(),
  updateProfileViewer: vi.fn(),
}));

vi.mock('../linkedin-profile-identity-resolver', () => ({
  resolveLinkedInProfileIdentity: mocks.resolveLinkedInProfileIdentity,
}));

vi.mock('shared/firestore-service', () => ({
  updateProfileViewer: mocks.updateProfileViewer,
}));

import { repairStoredProfileViewerIdentityMismatches } from '../profile-viewers-stored-identity-repair';

const storedViewer = {
  id: 'oleksii-vakhniuk-9235412b7',
  linkedinUrl: 'https://www.linkedin.com/in/oleksii-vakhniuk-9235412b7/',
  linkedinUsername: 'oleksii-vakhniuk-9235412b7',
  displayName: 'Alina Diachaenko',
  firstSeenAt: 1,
  lastSeenAt: 2,
  source: 'linkedin_profile_views',
} satisfies ProfileViewer;

describe('stored profile viewer identity repair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateProfileViewer.mockResolvedValue(undefined);
  });

  it('refuses a resolved display name that conflicts with the exact profile username', async () => {
    mocks.resolveLinkedInProfileIdentity.mockResolvedValue({
      linkedinUsername: storedViewer.linkedinUsername,
      displayName: 'Alina Diachaenko',
    });

    const result = await repairStoredProfileViewerIdentityMismatches('user-1', [storedViewer]);

    expect(mocks.updateProfileViewer).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({ repaired: false });
  });

  it('writes a compatible identity resolved for the exact username', async () => {
    mocks.resolveLinkedInProfileIdentity.mockResolvedValue({
      linkedinUsername: storedViewer.linkedinUsername,
      displayName: 'Oleksii Vakhniuk',
      profileUrn: 'urn:li:fsd_profile:oleksii',
    });

    await repairStoredProfileViewerIdentityMismatches('user-1', [storedViewer]);

    expect(mocks.updateProfileViewer).toHaveBeenCalledWith(
      'user-1',
      storedViewer.linkedinUsername,
      {
        displayName: 'Oleksii Vakhniuk',
        profileUrn: 'urn:li:fsd_profile:oleksii',
      }
    );
  });
});
