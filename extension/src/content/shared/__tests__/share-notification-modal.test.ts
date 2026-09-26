import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShareNotification, SharingLimitDetails } from 'shared/types';
import { ShareNotificationModal } from '../components/FeedActionModals/ShareNotificationModal';

describe('successful email share notification', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('tells the recipient who shared the feed and opens Shared feeds', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onDismiss = vi.fn(async () => undefined);
    const onViewSharedFeeds = vi.fn();
    const notification: ShareNotification = {
      id: 'email-share',
      kind: 'incoming_share_added',
      status: 'unread',
      ownerId: 'owner',
      recipientId: 'recipient',
      feedId: 'feed',
      feedName: 'Engineering',
      ownerDisplayName: 'Olena',
      recipientDisplayName: 'Alex',
      role: 'reader',
      createdAt: 1,
      updatedAt: 1,
    };

    flushSync(() => {
      root.render(
        createElement(ShareNotificationModal, {
          notification,
          onClose: vi.fn(),
          onDismiss,
          onAccept: vi.fn(async () => ({ success: true })),
          onAccepted: vi.fn(),
          onViewSharedFeeds,
          onSharingLimit: vi.fn(),
          onUpgrade: vi.fn(),
        })
      );
    });

    expect(document.body.textContent).toContain('A feed was shared with you');
    expect(document.body.textContent).toContain('Olena shared “Engineering” with you as a Reader.');

    const viewButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'View shared feeds'
    );
    viewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(onViewSharedFeeds).toHaveBeenCalledTimes(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it('dismisses a pending invitation before opening Pro', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onDismiss = vi.fn(async () => undefined);
    const onUpgrade = vi.fn();
    const notification: ShareNotification = {
      id: 'pending-share',
      kind: 'incoming_share_blocked',
      status: 'pending',
      ownerId: 'owner',
      recipientId: 'recipient',
      feedId: 'feed',
      feedName: 'Engineering',
      ownerDisplayName: 'Olena',
      recipientDisplayName: 'Alex',
      role: 'reader',
      createdAt: 1,
      updatedAt: 1,
    };

    flushSync(() => {
      root.render(
        createElement(ShareNotificationModal, {
          notification,
          onClose: vi.fn(),
          onDismiss,
          onAccept: vi.fn(async () => ({ success: false })),
          onAccepted: vi.fn(),
          onViewSharedFeeds: vi.fn(),
          onSharingLimit: vi.fn(),
          onUpgrade,
        })
      );
    });

    const viewProButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'View Pro'
    );
    viewProButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(onUpgrade).toHaveBeenCalledTimes(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss.mock.invocationCallOrder[0]).toBeLessThan(onUpgrade.mock.invocationCallOrder[0]);
    root.unmount();
  });

  it('dismisses a blocked invitation before showing the sharing-limit modal', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onDismiss = vi.fn(async () => undefined);
    const onSharingLimit = vi.fn();
    const sharingLimit: SharingLimitDetails = {
      code: 'SHARING_LIMIT_REACHED',
      direction: 'incoming',
      dimension: 'feeds',
      blockedParty: 'current_user',
      limit: 3,
      notificationCreated: true,
    };
    const notification: ShareNotification = {
      id: 'pending-share',
      kind: 'incoming_share_blocked',
      status: 'pending',
      ownerId: 'owner',
      recipientId: 'recipient',
      feedId: 'feed',
      feedName: 'Engineering',
      ownerDisplayName: 'Olena',
      recipientDisplayName: 'Alex',
      role: 'reader',
      createdAt: 1,
      updatedAt: 1,
    };

    flushSync(() => {
      root.render(
        createElement(ShareNotificationModal, {
          notification,
          onClose: vi.fn(),
          onDismiss,
          onAccept: vi.fn(async () => ({ success: false, sharingLimit })),
          onAccepted: vi.fn(),
          onViewSharedFeeds: vi.fn(),
          onSharingLimit,
          onUpgrade: vi.fn(),
        })
      );
    });

    const acceptButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Try to accept'
    );
    acceptButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(onSharingLimit).toHaveBeenCalledWith(sharingLimit));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss.mock.invocationCallOrder[0]).toBeLessThan(onSharingLimit.mock.invocationCallOrder[0]);
    root.unmount();
  });
});
