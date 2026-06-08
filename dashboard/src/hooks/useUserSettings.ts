import { useEffect, useState } from 'react';
import { getUserFeatureSettings, updateUserFeatureSettings } from 'shared/firestore-service';
import type { UserFeatureSettings } from 'shared/types';

const EXTENSION_ID = 'opgnfeilbmdpojamipidejalbiddapla';

const DEFAULT_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
};

function syncSettingsToExtension(settings: Partial<UserFeatureSettings>): void {
  const runtime = window.chrome?.runtime;
  if (!runtime?.sendMessage) {
    return;
  }

  runtime.sendMessage(EXTENSION_ID, {
    type: 'DASHBOARD_SYNC_SETTINGS',
    settings,
  }, () => undefined);
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
