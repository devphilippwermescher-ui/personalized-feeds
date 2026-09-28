import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharingLimitDetails } from 'shared/types';
import { createSharedFeedLinkController } from '../logic/shared-feed-link-controller';
import type { UserInfo } from '../types';

describe('shared feed link limits', () => {
  const controllerStops: Array<() => void> = [];

  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/feed/#sharefeed=second-recipient-token');
  });

  afterEach(() => {
    controllerStops.splice(0).forEach((stop) => stop());
    if (vi.isFakeTimers()) {
      vi.clearAllTimers();
    }
    vi.useRealTimers();
  });

  it('shows the sharing-limit modal instead of a not-found toast', async () => {
    const sharingLimit: SharingLimitDetails = {
      code: 'SHARING_LIMIT_REACHED',
      direction: 'outgoing',
      dimension: 'people',
      blockedParty: 'counterparty',
      limit: 1,
      counterpartDisplayName: 'Feed owner',
      notificationCreated: true,
    };
    const showSharingLimit = vi.fn();
    const showToast = vi.fn();
    const controller = createSharedFeedLinkController({
      getCurrentUser: () => ({ userId: 'recipient-user' }) as UserInfo,
      checkAuth: vi.fn(async () => undefined),
      sendMsg: vi.fn(async () => ({ success: false, error: 'Sharing limit reached', sharingLimit })),
      getSharedFeeds: () => [],
      setSharedFeeds: vi.fn(),
      openSidebar: vi.fn(),
      selectSharedTab: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast,
      showFollowedModal: vi.fn(),
      showSignInRequired: vi.fn(),
      showSharingLimit,
    });
    controllerStops.push(controller.stop);

    await controller.handlePendingSharedFeedLink();

    expect(showSharingLimit).toHaveBeenCalledWith(sharingLimit);
    expect(showToast).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('detects a share link pasted after the initial retry window without requiring reload', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/feed/');
    const sharingLimit: SharingLimitDetails = {
      code: 'SHARING_LIMIT_REACHED',
      direction: 'outgoing',
      dimension: 'people',
      blockedParty: 'counterparty',
      limit: 1,
      counterpartDisplayName: 'Feed owner',
      notificationCreated: true,
    };
    const showSharingLimit = vi.fn();
    const controller = createSharedFeedLinkController({
      getCurrentUser: () => ({ userId: 'recipient-user' }) as UserInfo,
      checkAuth: vi.fn(async () => undefined),
      sendMsg: vi.fn(async () => ({ success: false, error: 'Sharing limit reached', sharingLimit })),
      getSharedFeeds: () => [],
      setSharedFeeds: vi.fn(),
      openSidebar: vi.fn(),
      selectSharedTab: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast: vi.fn(),
      showFollowedModal: vi.fn(),
      showSignInRequired: vi.fn(),
      showSharingLimit,
    });
    controllerStops.push(controller.stop);

    controller.schedulePendingShareRetries();
    await vi.advanceTimersByTimeAsync(21_000);
    window.history.replaceState({}, '', '/feed/#sharefeed=pasted-later');
    await vi.advanceTimersByTimeAsync(300);

    expect(showSharingLimit).toHaveBeenCalledWith(sharingLimit);
    expect(window.location.hash).toBe('');
  });

  it('handles the same limited share link again without requiring reload', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/feed/');
    const sharingLimit: SharingLimitDetails = {
      code: 'SHARING_LIMIT_REACHED',
      direction: 'outgoing',
      dimension: 'people',
      blockedParty: 'counterparty',
      limit: 1,
      counterpartDisplayName: 'Feed owner',
      notificationCreated: true,
    };
    const showSharingLimit = vi.fn();
    const sendMsg = vi.fn(async () => ({ success: false, error: 'Sharing limit reached', sharingLimit }));
    const controller = createSharedFeedLinkController({
      getCurrentUser: () => ({ userId: 'recipient-user' }) as UserInfo,
      checkAuth: vi.fn(async () => undefined),
      sendMsg,
      getSharedFeeds: () => [],
      setSharedFeeds: vi.fn(),
      openSidebar: vi.fn(),
      selectSharedTab: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast: vi.fn(),
      showFollowedModal: vi.fn(),
      showSignInRequired: vi.fn(),
      showSharingLimit,
    });
    controllerStops.push(controller.stop);

    controller.schedulePendingShareRetries();
    window.history.replaceState({}, '', '/feed/#sharefeed=same-token');
    await vi.advanceTimersByTimeAsync(300);

    expect(sendMsg).toHaveBeenCalledTimes(1);
    expect(showSharingLimit).toHaveBeenCalledTimes(1);

    sendMsg.mockClear();
    showSharingLimit.mockClear();
    await vi.advanceTimersByTimeAsync(300);
    window.history.replaceState({}, '', '/feed/#sharefeed=same-token');
    await vi.advanceTimersByTimeAsync(300);

    expect(sendMsg).toHaveBeenCalledTimes(1);
    expect(showSharingLimit).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('');
  });

  it('opens the sidebar and explains that sign-in is required without consuming the link', async () => {
    const openSidebar = vi.fn();
    const showSignInRequired = vi.fn();
    const sendMsg = vi.fn();
    const controller = createSharedFeedLinkController({
      getCurrentUser: () => null,
      checkAuth: vi.fn(async () => undefined),
      sendMsg,
      getSharedFeeds: () => [],
      setSharedFeeds: vi.fn(),
      openSidebar,
      selectSharedTab: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast: vi.fn(),
      showFollowedModal: vi.fn(),
      showSignInRequired,
      showSharingLimit: vi.fn(),
    });
    controllerStops.push(controller.stop);

    await controller.handlePendingSharedFeedLink();
    await controller.handlePendingSharedFeedLink();

    expect(openSidebar).toHaveBeenCalledTimes(1);
    expect(showSignInRequired).toHaveBeenCalledTimes(1);
    expect(sendMsg).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#sharefeed=second-recipient-token');
    expect(sessionStorage.getItem('lfa_pending_sharefeed')).toBe('second-recipient-token');
  });

  it('follows the preserved share link after the user signs in', async () => {
    let currentUser: UserInfo | null = null;
    const showSignInRequired = vi.fn();
    const sharedFeed = {
      id: 'shared-feed',
      ownerId: 'owner',
      name: 'Engineering',
      color: '#615DEC',
      memberCount: 2,
      role: 'reader' as const,
    };
    const sendMsg = vi.fn(async () => ({ success: true, sharedFeed }));
    const showFollowedModal = vi.fn();
    const controller = createSharedFeedLinkController({
      getCurrentUser: () => currentUser,
      checkAuth: vi.fn(async () => undefined),
      sendMsg,
      getSharedFeeds: () => [],
      setSharedFeeds: vi.fn(),
      openSidebar: vi.fn(),
      selectSharedTab: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast: vi.fn(),
      showFollowedModal,
      showSignInRequired,
      showSharingLimit: vi.fn(),
    });
    controllerStops.push(controller.stop);

    await controller.handlePendingSharedFeedLink();
    currentUser = { userId: 'recipient-user' } as UserInfo;
    await controller.handlePendingSharedFeedLink();

    expect(showSignInRequired).toHaveBeenCalledTimes(1);
    expect(sendMsg).toHaveBeenCalledWith({
      type: 'FEEDS_FOLLOW_SHARE_LINK',
      token: 'second-recipient-token',
    });
    expect(showFollowedModal).toHaveBeenCalledWith(expect.objectContaining({ id: 'shared-feed' }));
    expect(window.location.hash).toBe('');
  });
});
