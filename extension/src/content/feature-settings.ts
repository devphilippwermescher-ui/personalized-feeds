import type { UserFeatureSettings } from 'shared/types';

const FEATURE_SETTINGS_STORAGE_KEY = 'pf_feature_settings';

export const DEFAULT_FEATURE_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
  hideProfileViewers: false,
};

export function loadFeatureSettings(): Promise<UserFeatureSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([FEATURE_SETTINGS_STORAGE_KEY], (result) => {
      const storedSettings = result[FEATURE_SETTINGS_STORAGE_KEY] as Partial<UserFeatureSettings> | undefined;
      if (storedSettings) {
        resolve({
          messagingButtons: storedSettings.messagingButtons ?? DEFAULT_FEATURE_SETTINGS.messagingButtons,
          postButtons: storedSettings.postButtons ?? DEFAULT_FEATURE_SETTINGS.postButtons,
          speechToComment: storedSettings.speechToComment ?? DEFAULT_FEATURE_SETTINGS.speechToComment,
          hideProfileViewers:
            storedSettings.hideProfileViewers ?? DEFAULT_FEATURE_SETTINGS.hideProfileViewers,
        });
        return;
      }

      chrome.runtime.sendMessage({ type: 'SETTINGS_GET' }, (response) => {
        const nextSettings = (response?.settings || DEFAULT_FEATURE_SETTINGS) as Partial<UserFeatureSettings>;
        resolve({
          messagingButtons: nextSettings.messagingButtons ?? DEFAULT_FEATURE_SETTINGS.messagingButtons,
          postButtons: nextSettings.postButtons ?? DEFAULT_FEATURE_SETTINGS.postButtons,
          speechToComment: nextSettings.speechToComment ?? DEFAULT_FEATURE_SETTINGS.speechToComment,
          hideProfileViewers:
            nextSettings.hideProfileViewers ?? DEFAULT_FEATURE_SETTINGS.hideProfileViewers,
        });
      });
    });
  });
}

export function onFeatureSettingsChange(callback: (settings: UserFeatureSettings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== 'local' || !changes[FEATURE_SETTINGS_STORAGE_KEY]) {
      return;
    }

    const nextSettings = (changes[FEATURE_SETTINGS_STORAGE_KEY].newValue || DEFAULT_FEATURE_SETTINGS) as Partial<UserFeatureSettings>;
    callback({
      messagingButtons: nextSettings.messagingButtons ?? DEFAULT_FEATURE_SETTINGS.messagingButtons,
      postButtons: nextSettings.postButtons ?? DEFAULT_FEATURE_SETTINGS.postButtons,
      speechToComment: nextSettings.speechToComment ?? DEFAULT_FEATURE_SETTINGS.speechToComment,
      hideProfileViewers:
        nextSettings.hideProfileViewers ?? DEFAULT_FEATURE_SETTINGS.hideProfileViewers,
    });
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
