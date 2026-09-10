import type { UserFeatureSettings } from 'shared/types';

export const FEATURE_SETTINGS_STORAGE_KEY = 'pf_feature_settings';

export const DEFAULT_FEATURE_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
  hideProfileViewers: false,
};

export function normalizeFeatureSettings(
  settings?: Partial<UserFeatureSettings> | null
): UserFeatureSettings {
  return {
    messagingButtons: settings?.messagingButtons ?? DEFAULT_FEATURE_SETTINGS.messagingButtons,
    postButtons: settings?.postButtons ?? DEFAULT_FEATURE_SETTINGS.postButtons,
    speechToComment: settings?.speechToComment ?? DEFAULT_FEATURE_SETTINGS.speechToComment,
    hideProfileViewers:
      settings?.hideProfileViewers ?? DEFAULT_FEATURE_SETTINGS.hideProfileViewers,
  };
}
