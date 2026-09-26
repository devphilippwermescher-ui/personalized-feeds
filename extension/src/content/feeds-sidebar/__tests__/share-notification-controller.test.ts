import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareNotification } from 'shared/types';
import { createShareNotificationController } from '../controllers/share-notification-controller';

function notification(id = 'notification-1'): ShareNotification {
  return {
    id,
    kind: 'link_follow_blocked_owner',
    status: 'unread',
    ownerId: 'owner',
    recipientId: 'recipient',
    feedId: 'feed',
    feedName: 'Engineering',
    ownerDisplayName: 'Owner',
    recipientDisplayName: 'Recipient',
    role: 'reader',
    limitDirection: 'outgoing',
    limitDimension: 'people',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('share notification controller', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn(),
        },
      },
    });
  });

  it('shows a pushed notification without reloading or opening the sidebar', () => {
    let runtimeListener: ((message: Record<string, unknown>) => void) | undefined;
    vi.spyOn(chrome.runtime.onMessage, 'addListener').mockImplementation((listener) => {
      runtimeListener = listener as typeof runtimeListener;
    });
    const showNotification = vi.fn();
    const controller = createShareNotificationController({
      sendMsg: vi.fn(async () => ({ success: true, notifications: [] })),
      hasOpenModal: () => false,
      showNotification,
    });

    controller.start();
    runtimeListener?.({ type: 'FEEDS_SHARE_NOTIFICATIONS_UPDATED', notifications: [notification()] });

    expect(showNotification).toHaveBeenCalledWith(notification());
  });

  it('waits until the current modal closes and does not show the same notification twice', () => {
    let modalOpen = true;
    const showNotification = vi.fn(() => {
      modalOpen = true;
    });
    const controller = createShareNotificationController({
      sendMsg: vi.fn(async () => ({ success: true, notifications: [] })),
      hasOpenModal: () => modalOpen,
      showNotification,
    });

    controller.handleLoadedNotifications([notification()]);
    expect(showNotification).not.toHaveBeenCalled();

    modalOpen = false;
    controller.handleModalClosed();
    expect(showNotification).toHaveBeenCalledTimes(1);

    modalOpen = false;
    controller.handleLoadedNotifications([notification()]);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it('checks Firestore again as soon as the owner returns to the LinkedIn tab', async () => {
    let notificationAvailable = false;
    const sendMsg = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'FEEDS_GET_SHARE_NOTIFICATIONS') {
        return { success: true, notifications: notificationAvailable ? [notification()] : [] };
      }
      return { success: true, notifications: [] };
    });
    const showNotification = vi.fn();
    const controller = createShareNotificationController({
      sendMsg,
      hasOpenModal: () => false,
      showNotification,
    });

    controller.start();
    await vi.waitFor(() => expect(sendMsg).toHaveBeenCalledWith({ type: 'FEEDS_GET_SHARE_NOTIFICATIONS' }));
    notificationAvailable = true;
    window.dispatchEvent(new Event('focus'));

    await vi.waitFor(() => expect(showNotification).toHaveBeenCalledWith(notification()));
  });

  it('retries briefly when the notification is written after the tab regains focus', async () => {
    vi.useFakeTimers();
    let refreshCount = 0;
    const sendMsg = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'FEEDS_GET_SHARE_NOTIFICATIONS') {
        refreshCount += 1;
        return {
          success: true,
          notifications: refreshCount >= 2 ? [notification('delayed-notification')] : [],
        };
      }
      return { success: true, notifications: [] };
    });
    const showNotification = vi.fn();
    const controller = createShareNotificationController({
      sendMsg,
      hasOpenModal: () => false,
      showNotification,
    });

    controller.start();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(showNotification).toHaveBeenCalledWith(notification('delayed-notification'));
    vi.useRealTimers();
  });
});
