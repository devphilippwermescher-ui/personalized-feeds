import { describe, expect, it } from 'vitest';
import {
  mergeProfileViewerWithPageMetadata,
  parseProfileViewerPageMetadata,
} from '../profile-viewers-enrichment';

describe('profile viewer page enrichment', () => {
  it('extracts authoritative name and avatar from profile metadata', () => {
    const html = `
      <meta property="og:title" content="Mykhailo Blokhin | LinkedIn">
      <meta property="og:image" content="https://media.licdn.com/dms/image/v2/test/profile-displayphoto-shrink_100_100/photo?e=4102444800">
    `;

    expect(parseProfileViewerPageMetadata(html)).toEqual({
      displayName: 'Mykhailo Blokhin',
      profileImageUrl:
        'https://media.licdn.com/dms/image/v2/test/profile-displayphoto-shrink_100_100/photo?e=4102444800',
    });
  });

  it('repairs a raw slug and drops an expired avatar', () => {
    const viewer = {
      linkedinUrl: 'https://www.linkedin.com/in/mykhailo-blokhin-29296b90/',
      linkedinUsername: 'mykhailo-blokhin-29296b90',
      displayName: 'mykhailo-blokhin-29296b90',
      profileImageUrl:
        'https://media.licdn.com/dms/image/v2/test/profile-displayphoto-shrink_100_100/photo?e=1',
    };

    const result = mergeProfileViewerWithPageMetadata(
      viewer,
      { displayName: '', profileImageUrl: '' },
      { displayName: 'Mykhailo Blokhin' }
    );

    expect(result.displayName).toBe('Mykhailo Blokhin');
    expect(result.profileImageUrl).toBe('');
  });
});
