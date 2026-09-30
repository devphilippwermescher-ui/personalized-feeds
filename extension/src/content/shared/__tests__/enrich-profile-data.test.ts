import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchLinkedInRelationshipStatus } = vi.hoisted(() => ({
  fetchLinkedInRelationshipStatus: vi.fn(),
}));

vi.mock('../../linkedin-relationship-status', () => ({
  fetchLinkedInRelationshipStatus,
}));

import { enrichProfileDataForFeed } from '../enrich-profile-data';

const profile = {
  linkedinUrl: 'https://www.linkedin.com/in/olga-titienkova/',
  linkedinUsername: 'olga-titienkova',
  displayName: 'Olga Titienkova',
};

describe('feed profile enrichment', () => {
  beforeEach(() => {
    fetchLinkedInRelationshipStatus.mockReset();
  });

  it('drops an extension-owned icon when relationship enrichment fails', async () => {
    fetchLinkedInRelationshipStatus.mockRejectedValue(new Error('LinkedIn request failed'));

    await expect(
      enrichProfileDataForFeed({
        ...profile,
        profileImageUrl: 'chrome-extension://extension-id/icons/icon48.png',
      })
    ).resolves.toMatchObject({ profileImageUrl: '' });
  });

  it('uses a valid LinkedIn avatar returned by relationship enrichment', async () => {
    const avatar = 'https://media.licdn.com/dms/image/profile-displayphoto-shrink_100_100/olga';
    fetchLinkedInRelationshipStatus.mockResolvedValue({
      status: 'connect',
      profileImageUrl: avatar,
    });

    await expect(enrichProfileDataForFeed(profile)).resolves.toMatchObject({
      profileImageUrl: avatar,
    });
  });
});
