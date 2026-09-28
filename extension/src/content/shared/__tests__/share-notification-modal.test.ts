import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShareNotification } from 'shared/types';
import { ShareLinkSignInModal } from '../components/FeedActionModals/ShareLinkSignInModal';
import { ShareNotificationModal } from '../components/FeedActionModals/ShareNotificationModal';

describe('successful email share notification', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('explains that a shared-feed link requires extension sign-in and can be closed', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onClose = vi.fn();

    flushSync(() => {
      root.render(createElement(ShareLinkSignInModal, { onClose }));
    });

    expect(document.body.textContent).toContain('Sign in to view this shared feed');
    expect(document.body.textContent).toContain('Sign in to myFeedPilot in the sidebar to open it.');
    expect(document.body.textContent).toContain('Your shared-feed link will remain available after you sign in.');

    const closeButton = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Close');
    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
    root.unmount();
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
          onViewSharedFeeds,
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

  it('dismisses a pending invitation before showing the Pro development notice', async () => {
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
          onViewSharedFeeds: vi.fn(),
          onUpgrade,
        })
      );
    });

    const footerLabels = [...document.querySelectorAll('button')].map((button) => button.textContent);
    expect(footerLabels).toContain('Close');
    expect(footerLabels).toContain('Get Pro');
    expect(footerLabels).not.toContain('Try to accept');

    const viewProButton = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Get Pro');
    viewProButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(onUpgrade).toHaveBeenCalledTimes(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss.mock.invocationCallOrder[0]).toBeLessThan(onUpgrade.mock.invocationCallOrder[0]);
    root.unmount();
  });
});
