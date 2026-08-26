import { useEffect, useState } from 'react';
import { getUserFeatureSettings, updateUserFeatureSettings } from 'shared/firestore-service';
import type { UserFeatureSettings } from 'shared/types';
import { sendMessageToExtension } from '../utils/extensionMessaging';

const DEFAULT_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
  hideProfileViewers: false,
};

function syncSettingsToExtension(settings: Partial<UserFeatureSettings>): void {
  void sendMessageToExtension({
    type: 'DASHBOARD_SYNC_SETTINGS',
    settings,
  });
}

export function useUserSettings(userId: string) {
  const [settings, setSettings] = useState<UserFeatureSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof UserFeatureSettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getUserFeatureSettings(userId)
      .then((nextSettings) => {
        if (!cancelled) {
          setSettings(nextSettings);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updateSetting = async (key: keyof UserFeatureSettings, value: boolean) => {
    setSavingKey(key);
    const nextSettings = await updateUserFeatureSettings(userId, { [key]: value });
    setSettings(nextSettings);
    syncSettingsToExtension({ [key]: value });
    setSavingKey(null);
  };

  return {
    settings,
    loading,
    savingKey,
    updateSetting,
  };
}
