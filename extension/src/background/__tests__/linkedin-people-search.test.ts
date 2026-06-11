import { describe, expect, it } from 'vitest';
import { findLinkedInPeopleSearchResultByUsername } from 'shared/linkedin-people-search';

function person(
  username: string,
  displayName: string,
  imageId: string
): Record<string, unknown> {
  return {
    target: { '*profile': `urn:li:fsd_profile:${imageId}` },
    navigationUrl: `/in/${username}/`,
    title: { text: displayName },
    subtitle: { text: '2nd • Software Engineer' },
    image: {
      attributes: [
        {
          detailData: {
            nonEntityProfilePicture: {
              vectorImage: {
                rootUrl: `https://media.licdn.com/dms/image/v2/${imageId}/`,
                artifacts: [
                  {
                    width: 200,
                    fileIdentifyingUrlPathSegment:
                      'profile-displayphoto-shrink_200_200/photo?e=4102444800',
                  },
                ],
              },
            },
          },
        },
      ],
    },
  };
}

describe('LinkedIn people search identity matching', () => {
  it('returns the avatar from the exact username result, not the first profile', () => {
    const payload = {
      data: {
        data: {
          searchDashSharingByBlended: {
            elements: [
              person('mykhailo-blokhin-29296b90', 'Mykhailo Blokhin', 'MYKHAILO'),
              person('yuliia-biliavtseva', 'Yuliia Biliavtseva', 'YULIIA'),
            ],
          },
        },
      },
    };

    const result = findLinkedInPeopleSearchResultByUsername(
      payload,
      'yuliia-biliavtseva'
    );

    expect(result?.displayName).toBe('Yuliia Biliavtseva');
    expect(result?.profileImageUrl).toContain('/YULIIA/');
    expect(result?.profileImageUrl).not.toContain('/MYKHAILO/');
  });
});
