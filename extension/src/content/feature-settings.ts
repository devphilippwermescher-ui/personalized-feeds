import type { UserFeatureSettings } from 'shared/types';
import {
  DEFAULT_FEATURE_SETTINGS,
  FEATURE_SETTINGS_STORAGE_KEY,
  normalizeFeatureSettings,
} from '../shared/feature-settings';

export { DEFAULT_FEATURE_SETTINGS } from '../shared/feature-settings';

export function loadFeatureSettings(): Promise<UserFeatureSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([FEATURE_SETTINGS_STORAGE_KEY], (result) => {
      const storedSettings = result[FEATURE_SETTINGS_STORAGE_KEY] as Partial<UserFeatureSettings> | undefined;
      if (storedSettings) {
        resolve(normalizeFeatureSettings(storedSettings));
        return;
      }

      chrome.runtime.sendMessage({ type: 'SETTINGS_GET' }, (response) => {
        const nextSettings = (response?.settings || DEFAULT_FEATURE_SETTINGS) as Partial<UserFeatureSettings>;
        resolve(normalizeFeatureSettings(nextSettings));
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
    callback(normalizeFeatureSettings(nextSettings));
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
