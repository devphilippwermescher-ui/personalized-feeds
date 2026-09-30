import type { UserProfilePreferences } from './types';

export const DEFAULT_USER_PROFILE_PREFERENCES: UserProfilePreferences = {
  displayName: '',
  avatarDataUrl: '',
};

export function normalizeUserProfilePreferences(
  value?: Partial<UserProfilePreferences> | null
): UserProfilePreferences {
  return {
    displayName: typeof value?.displayName === 'string' ? value.displayName.trim().slice(0, 60) : '',
    avatarDataUrl: typeof value?.avatarDataUrl === 'string' ? value.avatarDataUrl : '',
  };
}
