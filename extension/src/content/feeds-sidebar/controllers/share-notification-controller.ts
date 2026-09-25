import type { ShareNotification } from 'shared/types';

interface ShareNotificationControllerDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  hasOpenModal: () => boolean;
  showNotification: (notification: ShareNotification) => void;
}

export function createShareNotificationController(deps: ShareNotificationControllerDeps): {
  start: () => void;
  handleLoadedNotifications: (notifications: unknown) => void;
  handleModalClosed: () => void;
} {
  let queuedNotification: ShareNotification | null = null;
  let shownNotificationId: string | null = null;
  let listenerAttached = false;
  let refreshInFlight: Promise<void> | null = null;
  let refreshQueued = false;
  let retryTimeoutIds: number[] = [];

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
    if (message.type !== 'FEEDS_SHARE_NOTIFICATIONS_UPDATED') return;
    handleLoadedNotifications(message.notifications);
  };

  const refreshNotifications = (): Promise<void> => {
    if (refreshInFlight) {
      refreshQueued = true;
      return refreshInFlight;
    }
    refreshInFlight = deps
      .sendMsg({ type: 'FEEDS_GET_SHARE_NOTIFICATIONS' })
      .then((response) => {
        if (response?.success) handleLoadedNotifications(response.notifications);
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
    void deps
      .sendMsg({ type: 'FEEDS_WATCH_SHARE_NOTIFICATIONS' })
      .then((response) => {
        if (response?.success) handleLoadedNotifications(response.notifications);
      })
      .catch((error) => {
        console.warn('[feed-sharing] Could not start notification updates', error);
      });
  };

  const scheduleRefreshBurst = (): void => {
    clearRetryTimeouts();
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
    handleLoadedNotifications,
    handleModalClosed: showQueuedNotification,
  };
}
