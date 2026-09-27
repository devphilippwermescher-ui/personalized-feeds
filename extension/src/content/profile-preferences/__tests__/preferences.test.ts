import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_PROFILE_PREFERENCES, normalizeUserProfilePreferences } from 'shared/user-profile-preferences';

describe('profile preferences', () => {
  it('provides empty profile defaults for new users', () => {
    expect(normalizeUserProfilePreferences(null)).toEqual(DEFAULT_USER_PROFILE_PREFERENCES);
    expect(normalizeUserProfilePreferences(null)).toEqual({ displayName: '', avatarDataUrl: '' });
  });

  it('normalizes the display name while preserving the avatar', () => {
    expect(
      normalizeUserProfilePreferences({
        displayName: '  Custom Name  ',
        avatarDataUrl: 'data:image/webp;base64,abc',
      })
    ).toEqual({
      displayName: 'Custom Name',
      avatarDataUrl: 'data:image/webp;base64,abc',
    });
  });
});
