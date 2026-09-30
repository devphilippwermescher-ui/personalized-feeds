import type { ShareNotification } from 'shared/types';

interface ShareNotificationControllerDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  isAuthenticated: () => boolean;
  hasOpenModal: () => boolean;
  showNotification: (notification: ShareNotification) => void;
}

export function createShareNotificationController(deps: ShareNotificationControllerDeps): {
  start: () => void;
  reset: () => void;
  handleLoadedNotifications: (notifications: unknown) => void;
  handleModalClosed: () => void;
} {
  let queuedNotification: ShareNotification | null = null;
  let shownNotificationId: string | null = null;
  let listenerAttached = false;
  let refreshInFlight: Promise<void> | null = null;
  let refreshQueued = false;
  let retryTimeoutIds: number[] = [];
  let lifecycleRevision = 0;

  const clearRetryTimeouts = (): void => {
    retryTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    retryTimeoutIds = [];
  };

  const showQueuedNotification = (): void => {
    if (!queuedNotification || deps.hasOpenModal()) return;
    if (shownNotificationId === queuedNotification.id) {
      queuedNotification = null;
      return;
    }

    const notification = queuedNotification;
    queuedNotification = null;
    shownNotificationId = notification.id;
    clearRetryTimeouts();
    deps.showNotification(notification);
  };

  const handleLoadedNotifications = (value: unknown): void => {
    const notification = Array.isArray(value) ? (value[0] as ShareNotification | undefined) : undefined;
    if (!notification || notification.id === shownNotificationId) return;
    queuedNotification = notification;
    showQueuedNotification();
  };

  const runtimeListener = (message: Record<string, unknown>): void => {
    if (message.type !== 'FEEDS_SHARE_NOTIFICATIONS_UPDATED' || !deps.isAuthenticated()) return;
    handleLoadedNotifications(message.notifications);
  };

  const refreshNotifications = (): Promise<void> => {
    if (!deps.isAuthenticated()) {
      return Promise.resolve();
    }
    if (refreshInFlight) {
      refreshQueued = true;
      return refreshInFlight;
    }
    const requestRevision = lifecycleRevision;
    refreshInFlight = deps
      .sendMsg({ type: 'FEEDS_GET_SHARE_NOTIFICATIONS' })
      .then((response) => {
        if (requestRevision === lifecycleRevision && deps.isAuthenticated() && response?.success) {
          handleLoadedNotifications(response.notifications);
        }
      })
      .catch((error) => {
        console.warn('[feed-sharing] Could not refresh notifications', error);
      })
      .finally(() => {
        refreshInFlight = null;
        if (refreshQueued) {
          refreshQueued = false;
          void refreshNotifications();
        }
      });
    return refreshInFlight;
  };

  const ensureRealtimeUpdates = (): void => {
    if (!deps.isAuthenticated()) return;
    const requestRevision = lifecycleRevision;
    void deps
      .sendMsg({ type: 'FEEDS_WATCH_SHARE_NOTIFICATIONS' })
      .then((response) => {
        if (requestRevision === lifecycleRevision && deps.isAuthenticated() && response?.success) {
          handleLoadedNotifications(response.notifications);
        }
      })
      .catch((error) => {
        console.warn('[feed-sharing] Could not start notification updates', error);
      });
  };

  const scheduleRefreshBurst = (): void => {
    clearRetryTimeouts();
    if (!deps.isAuthenticated()) return;
    ensureRealtimeUpdates();
    void refreshNotifications();
    retryTimeoutIds = [1_000, 3_000, 7_000].map((delay) =>
      window.setTimeout(() => {
        void refreshNotifications();
      }, delay)
    );
  };

  return {
    start: () => {
      if (!listenerAttached) {
        listenerAttached = true;
        chrome.runtime.onMessage.addListener(runtimeListener);
        window.addEventListener('focus', scheduleRefreshBurst);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          scheduleRefreshBurst();
        });
      }

      scheduleRefreshBurst();
    },
    reset: () => {
      lifecycleRevision += 1;
      clearRetryTimeouts();
      refreshQueued = false;
      queuedNotification = null;
      shownNotificationId = null;
    },
    handleLoadedNotifications,
    handleModalClosed: showQueuedNotification,
  };
}
