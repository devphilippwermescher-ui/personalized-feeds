import { subscribeShareNotifications } from 'shared/firestore-service';
import type { ShareNotification } from 'shared/types';
import { getCurrentUser, onAuthChange } from '../../../../services/auth';
import { getAuthenticatedFeedsUser } from '../../auth/services/authenticated-user';

const LINKEDIN_TAB_PATTERN = 'https://www.linkedin.com/*';

let activeUserId: string | null = null;
let unsubscribe: (() => void) | null = null;
let startInFlight: Promise<ShareNotification[]> | null = null;
let latestNotifications: ShareNotification[] = [];
let authListenerRegistered = false;

async function notifyLinkedInTabs(notifications: ShareNotification[]): Promise<void> {
  const tabs = await chrome.tabs.query({ url: LINKEDIN_TAB_PATTERN });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) =>
        chrome.tabs
          .sendMessage(tab.id, {
            type: 'FEEDS_SHARE_NOTIFICATIONS_UPDATED',
            notifications,
          })
          .catch(() => {
            // A LinkedIn tab may not have the sidebar content script yet.
          })
      )
  );
}

export function stopShareNotificationRuntime(): void {
  unsubscribe?.();
  unsubscribe = null;
  activeUserId = null;
  latestNotifications = [];
}

export function startShareNotificationRuntime(): Promise<ShareNotification[]> {
  if (startInFlight) return startInFlight;

  startInFlight = (async () => {
    const user = await getAuthenticatedFeedsUser();
    if (!user || getCurrentUser()?.uid !== user.uid) {
      stopShareNotificationRuntime();
      return [];
    }

    if (activeUserId === user.uid && unsubscribe) {
      return latestNotifications;
    }

    stopShareNotificationRuntime();
    activeUserId = user.uid;
    unsubscribe = subscribeShareNotifications(
      user.uid,
      (notifications) => {
        latestNotifications = notifications;
        void notifyLinkedInTabs(notifications);
      },
      (error) => {
        console.warn('[feed-sharing] Notification listener stopped', {
          userId: user.uid,
          error: error.message,
        });
        stopShareNotificationRuntime();
      }
    );

    return latestNotifications;
  })().finally(() => {
    startInFlight = null;
  });

  return startInFlight;
}

export function registerShareNotificationRuntime(): void {
  if (authListenerRegistered) return;
  authListenerRegistered = true;

  onAuthChange((user) => {
    if (!user) {
      stopShareNotificationRuntime();
      return;
    }

    void startShareNotificationRuntime().catch((error) => {
      console.warn('[feed-sharing] Notification runtime could not start', error);
    });
  });
}
