import { describe, expect, it } from 'vitest';
import { normalizeLinkedInProfileImageUrl } from '../../../../../shared/linkedin-profile-image';

describe('LinkedIn profile image persistence', () => {
  it('accepts an HTTPS LinkedIn CDN image', () => {
    const avatar = 'https://media.licdn.com/dms/image/profile-displayphoto-shrink_100_100/olga';
    expect(normalizeLinkedInProfileImageUrl(avatar)).toBe(avatar);
  });

  it('rejects extension-owned and unrelated images', () => {
    expect(normalizeLinkedInProfileImageUrl('chrome-extension://extension-id/icons/icon48.png')).toBe('');
    expect(normalizeLinkedInProfileImageUrl('https://example.com/avatar.png')).toBe('');
  });

  it('rejects an expired LinkedIn CDN image', () => {
    expect(
      normalizeLinkedInProfileImageUrl(
        'https://media.licdn.com/dms/image/profile-displayphoto-shrink_100_100/olga?e=1000',
        1_000_001
      )
    ).toBe('');
  });
});
