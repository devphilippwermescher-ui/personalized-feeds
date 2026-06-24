import { describe, expect, it } from 'vitest';
import {
  chooseProfileViewerDisplayName,
  chooseProfileViewerImageUrl,
  getAmbiguousProfileViewerImageUrls,
  humanizeLinkedInUsername,
  isUsableLinkedInProfileImageUrl,
} from 'shared/profile-viewer-quality';

describe('profile viewer data quality', () => {
  it('repairs a raw LinkedIn slug and preserves an existing proper name', () => {
    expect(humanizeLinkedInUsername('mykhailo-blokhin-29296b90')).toBe('Mykhailo Blokhin');
    expect(
      chooseProfileViewerDisplayName(
        'mykhailo-blokhin-29296b90',
        'Mykhailo Blokhin',
        'mykhailo-blokhin-29296b90'
      )
    ).toBe('Mykhailo Blokhin');
  });

  it('lets a name that matches the profile slug replace a polluted existing name', () => {
    expect(
      chooseProfileViewerDisplayName(
        'Alia Waleczek',
        'Dima Lavrov',
        'alia-waleczek-806248315'
      )
    ).toBe('Alia Waleczek');
  });

  it('rejects expired profile images and keeps a valid existing image', () => {
    const expired =
      'https://media.licdn.com/dms/image/v2/test/profile-displayphoto-shrink_100_100/a?e=1';
    const valid =
      'https://media.licdn.com/dms/image/v2/test/profile-displayphoto-shrink_100_100/b?e=4102444800';

    expect(isUsableLinkedInProfileImageUrl(expired)).toBe(false);
    expect(chooseProfileViewerImageUrl(expired, valid)).toBe(valid);
  });

  it('rejects an unfinished LinkedIn vector-image root as an avatar URL', () => {
    expect(
      isUsableLinkedInProfileImageUrl(
        'https://media.licdn.com/dms/image/v2/D5603AQGlQityODjaNQ/profile-displayphoto-scale_'
      )
    ).toBe(false);
  });

  it('marks an avatar URL shared by different profiles as ambiguous', () => {
    const duplicateImage =
      'https://media.licdn.com/dms/image/v2/test/profile-displayphoto-shrink_100_100/photo?e=4102444800';

    expect(
      getAmbiguousProfileViewerImageUrls([
        { linkedinUsername: 'yuliia', profileImageUrl: duplicateImage },
        { linkedinUsername: 'mykhailo', profileImageUrl: duplicateImage },
        {
          linkedinUsername: 'vlad',
          profileImageUrl:
            'https://media.licdn.com/dms/image/v2/other/profile-displayphoto-shrink_100_100/photo?e=4102444800',
        },
      ])
    ).toEqual(new Set([duplicateImage]));
  });
});
