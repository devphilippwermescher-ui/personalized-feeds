import type { ProfileViewersCollectionProgress } from '../../../shared/profile-viewers-progress';

export function parseProfileViewersCollectionProgress(value: unknown): ProfileViewersCollectionProgress | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const progress = value as Partial<ProfileViewersCollectionProgress>;
  if ((progress.phase !== 'visible' && progress.phase !== 'private_summary') || !Number.isFinite(progress.startedAt)) {
    return undefined;
  }

  return {
    phase: progress.phase,
    startedAt: progress.startedAt as number,
  };
}

export function registerProfileViewersRuntimeController(options: {
  setCollectionProgress: (progress: ProfileViewersCollectionProgress | undefined) => void;
  refreshAfterSync: () => Promise<void>;
}): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROFILE_VIEWERS_SYNC_STARTED') {
      const progress = parseProfileViewersCollectionProgress(message.syncProgress);
      if (progress) options.setCollectionProgress(progress);
      return;
    }

    if (message.type === 'PROFILE_VIEWERS_SYNC_COMPLETED') {
      if (message.collectionFinished === true) {
        options.setCollectionProgress(undefined);
      }
      void options.refreshAfterSync();
    }
  });
}
