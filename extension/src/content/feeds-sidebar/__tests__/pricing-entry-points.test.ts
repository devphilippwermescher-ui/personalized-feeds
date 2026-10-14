import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Root } from 'react-dom/client';
import type { ShareNotification, SharingLimitDetails } from 'shared/types';
import { openPricingPage } from '../../subscription/public';
import { showShareNotificationModal, showSharingLimitModal } from '../logic/feed-action-operations';
import type { FeedActionDeps } from '../logic/feed-action-types';

vi.mock('../../subscription/public', () => ({ openPricingPage: vi.fn().mockResolvedValue(undefined) }));

function createDeps(): FeedActionDeps {
  let modalState: { el: HTMLElement | null; root: Root | null } = { el: null, root: null };
  return {
    getModalState: () => modalState,
    setModalState: (state: { el: HTMLElement | null; root: Root | null }) => {
      modalState = state;
    },
    sendMsg: vi.fn().mockResolvedValue({ success: true }),
    showPlanModal: vi.fn(),
    showToast: vi.fn(),
  } as unknown as FeedActionDeps;
}

describe('feed sharing pricing entry points', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('opens pricing when Get Pro is clicked in a limit notification', async () => {
    const deps = createDeps();
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

    showShareNotificationModal(notification, deps);
    await vi.waitFor(() =>
      expect([...document.querySelectorAll('button')].some((button) => button.textContent === 'Get Pro')).toBe(true)
    );
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'Get Pro')?.click();

    await vi.waitFor(() => expect(openPricingPage).toHaveBeenCalledOnce());
    expect(deps.showPlanModal).not.toHaveBeenCalled();
    expect(deps.sendMsg).toHaveBeenCalledWith({
      type: 'FEEDS_DISMISS_SHARE_NOTIFICATION',
      notificationId: 'pending-share',
    });
  });

  it('opens pricing when View Pro is clicked after a sharing limit', async () => {
    const deps = createDeps();
    const details: SharingLimitDetails = {
      code: 'SHARING_LIMIT_REACHED',
      direction: 'outgoing',
      dimension: 'feeds',
      blockedParty: 'current_user',
      limit: 3,
      notificationCreated: false,
    };

    showSharingLimitModal(details, 'email', deps);
    await vi.waitFor(() =>
      expect([...document.querySelectorAll('button')].some((button) => button.textContent === 'View Pro')).toBe(true)
    );
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'View Pro')?.click();

    await vi.waitFor(() => expect(openPricingPage).toHaveBeenCalledOnce());
    expect(deps.showPlanModal).not.toHaveBeenCalled();
  });
});
