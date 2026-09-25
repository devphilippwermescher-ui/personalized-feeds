import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedFeedsUser: vi.fn(),
  onAuthChange: vi.fn(),
  subscribeFeedShares: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('shared/firestore-service', () => ({
  subscribeFeedShares: mocks.subscribeFeedShares,
}));
vi.mock('../../../../services/auth', () => ({
  onAuthChange: mocks.onAuthChange,
}));
vi.mock('../../auth/services/authenticated-user', () => ({
  getAuthenticatedFeedsUser: mocks.getAuthenticatedFeedsUser,
}));

import { startFeedSharesRuntime, stopAllFeedSharesRuntime } from '../services/feed-shares-runtime';

describe('feed shares realtime runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedFeedsUser.mockResolvedValue({ uid: 'owner' });
    mocks.subscribeFeedShares.mockReturnValue(mocks.unsubscribe);
    vi.stubGlobal('chrome', {
      tabs: {
        sendMessage: vi.fn(async () => undefined),
        onRemoved: { addListener: vi.fn() },
      },
    });
  });

  afterEach(() => {
    stopAllFeedSharesRuntime();
    vi.unstubAllGlobals();
  });

  it('pushes changed recipients to the LinkedIn tab that opened the modal', async () => {
    await startFeedSharesRuntime('feed', 7);
    const onShares = mocks.subscribeFeedShares.mock.calls[0]?.[2] as
      | ((shares: Array<Record<string, unknown>>) => void)
      | undefined;
    const shares = [
      {
        targetUid: 'recipient',
        targetEmail: 'recipient@example.com',
        displayName: 'Recipient',
        role: 'reader',
      },
    ];

    onShares?.(shares);

    await vi.waitFor(() =>
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
        type: 'FEEDS_FEED_SHARES_UPDATED',
        ownerId: 'owner',
        feedId: 'feed',
        shares,
      })
    );
  });
});
