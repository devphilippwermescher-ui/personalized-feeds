import {
  PROFILE_VIEWERS_COLLECTION_PROGRESS_LEASE_MS,
  type ProfileViewersCollectionProgress,
} from '../../../shared/profile-viewers-progress';

export function parseProfileViewersCollectionProgress(
  value: unknown,
  now = Date.now()
): ProfileViewersCollectionProgress | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const progress = value as Partial<ProfileViewersCollectionProgress>;
  if ((progress.phase !== 'visible' && progress.phase !== 'private_summary') || !Number.isFinite(progress.startedAt)) {
    return undefined;
  }

  const startedAt = progress.startedAt as number;
  const expiresAt = Number.isFinite(progress.expiresAt)
    ? (progress.expiresAt as number)
    : startedAt + PROFILE_VIEWERS_COLLECTION_PROGRESS_LEASE_MS;
  if (expiresAt <= now) return undefined;

  return {
    phase: progress.phase,
    startedAt,
    expiresAt,
  };
}

export function registerProfileViewersRuntimeController(options: {
  setCollectionProgress: (progress: ProfileViewersCollectionProgress | undefined) => void;
  refreshAfterSync: () => Promise<void>;
}): { clearCollectionProgressLease: () => void } {
  let progressExpiryTimer: ReturnType<typeof setTimeout> | undefined;

  const clearCollectionProgressLease = (): void => {
    if (progressExpiryTimer !== undefined) {
      clearTimeout(progressExpiryTimer);
      progressExpiryTimer = undefined;
    }
  };

  const setCollectionProgress = (progress: ProfileViewersCollectionProgress | undefined): void => {
    clearCollectionProgressLease();
    options.setCollectionProgress(progress);
    if (!progress?.expiresAt) return;

    progressExpiryTimer = setTimeout(
      () => {
        progressExpiryTimer = undefined;
        options.setCollectionProgress(undefined);
        void options.refreshAfterSync();
      },
      Math.max(0, progress.expiresAt - Date.now())
    );
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROFILE_VIEWERS_SYNC_STARTED') {
      const progress = parseProfileViewersCollectionProgress(message.syncProgress);
      setCollectionProgress(progress);
      return;
    }

    if (message.type === 'PROFILE_VIEWERS_SYNC_COMPLETED') {
      if (message.collectionFinished === true) {
        setCollectionProgress(undefined);
      }
      void options.refreshAfterSync();
    }
  });

  return { clearCollectionProgressLease };
}
