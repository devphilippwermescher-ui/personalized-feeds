import type { UserProfilePreferences } from 'shared/types';
import type { UserInfo } from '../../feeds-sidebar/types';

interface ProfilePreferencesResponse {
  success?: boolean;
  error?: string;
  preferences?: UserProfilePreferences;
  user?: UserInfo;
}

async function sendMessage(message: Record<string, unknown>): Promise<ProfilePreferencesResponse> {
  return chrome.runtime.sendMessage(message) as Promise<ProfilePreferencesResponse>;
}

function assertResponse(response: ProfilePreferencesResponse): { preferences: UserProfilePreferences; user: UserInfo } {
  if (!response?.success || !response.preferences || !response.user) {
    throw new Error(response?.error || 'Profile preferences could not be loaded.');
  }
  return { preferences: response.preferences, user: response.user };
}

export async function loadProfilePreferences(): Promise<{
  preferences: UserProfilePreferences;
  user: UserInfo;
}> {
  return assertResponse(await sendMessage({ type: 'PROFILE_PREFERENCES_GET' }));
}

export async function saveProfilePreferences(
  preferences: UserProfilePreferences
): Promise<{ preferences: UserProfilePreferences; user: UserInfo }> {
  return assertResponse(
    await sendMessage({
      type: 'PROFILE_PREFERENCES_UPDATE',
      preferences,
    })
  );
}
