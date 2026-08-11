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

  it('keeps the RSC name when page metadata belongs to a different profile', () => {
    const result = mergeProfileViewerWithPageMetadata(
      {
        linkedinUrl: 'https://www.linkedin.com/in/alia-waleczek-806248315/',
        linkedinUsername: 'alia-waleczek-806248315',
        displayName: 'Alia Waleczek',
        profileImageUrl: '',
      },
      { displayName: 'Dima Lavrov', profileImageUrl: '' },
      undefined
    );

    expect(result.displayName).toBe('Alia Waleczek');
  });

  it('repairs an uncertain mixed identity with metadata from the exact profile URL', () => {
    const result = mergeProfileViewerWithPageMetadata(
      {
        linkedinUrl: 'https://www.linkedin.com/in/julia-mozharova/',
        linkedinUsername: 'julia-mozharova',
        displayName: 'Julia Mozharova',
        profileImageUrl:
          'https://media.licdn.com/dms/image/v2/adam/profile-displayphoto-shrink_100_100/photo?e=4102444800',
        identityUncertain: true,
      },
      {
        displayName: 'Julia Mozharova',
        profileImageUrl:
          'https://media.licdn.com/dms/image/v2/julia/profile-displayphoto-shrink_100_100/photo?e=4102444800',
      },
      {
        displayName: 'Julia Mozharova',
        profileImageUrl:
          'https://media.licdn.com/dms/image/v2/adam/profile-displayphoto-shrink_100_100/photo?e=4102444800',
      }
    );

    expect(result.profileImageUrl).toContain('/julia/');
    expect(result.profileImageUrl).not.toContain('/adam/');
    expect(result.identityUncertain).toBe(false);
  });

  it('does not verify an uncertain display name when the exact page yields only an avatar', () => {
    const result = mergeProfileViewerWithPageMetadata(
      {
        linkedinUrl: 'https://www.linkedin.com/in/ACoAAAdamToken123/',
        linkedinUsername: 'acoaaadamtoken123',
        displayName: 'Julia Mozharova',
        profileImageUrl: '',
        identityUncertain: true,
      },
      {
        displayName: '',
        profileImageUrl:
          'https://media.licdn.com/dms/image/v2/adam/profile-displayphoto-shrink_100_100/photo?e=4102444800',
      },
      undefined
    );

    expect(result.displayName).toBe('Julia Mozharova');
    expect(result.profileImageUrl).toContain('/adam/');
    expect(result.identityUncertain).toBe(true);
  });
});
