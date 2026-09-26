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
      selectSharedTab: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast,
      showFollowedModal: vi.fn(),
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
      selectSharedTab: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast: vi.fn(),
      showFollowedModal: vi.fn(),
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
      selectSharedTab: vi.fn(),
      renderSidebarContent: vi.fn(),
      showToast: vi.fn(),
      showFollowedModal: vi.fn(),
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
});
