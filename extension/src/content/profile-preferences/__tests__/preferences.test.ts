import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_PROFILE_PREFERENCES, normalizeUserProfilePreferences } from 'shared/user-profile-preferences';

describe('profile preferences', () => {
  it('defaults new users to EUR', () => {
    expect(normalizeUserProfilePreferences(null)).toEqual(DEFAULT_USER_PROFILE_PREFERENCES);
    expect(normalizeUserProfilePreferences(null).billingCurrency).toBe('EUR');
  });

  it('preserves a supported saved currency and normalizes the display name', () => {
    expect(
      normalizeUserProfilePreferences({
        displayName: '  Custom Name  ',
        avatarDataUrl: 'data:image/webp;base64,abc',
        billingCurrency: 'USD',
      })
    ).toEqual({
      displayName: 'Custom Name',
      avatarDataUrl: 'data:image/webp;base64,abc',
      billingCurrency: 'USD',
    });
  });
});
