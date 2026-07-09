import { describe, expect, it, vi } from 'vitest';
import { moveFeed } from '../logic/feed-action-operations';
import type { FeedInfo } from '../types';

function makeFeed(id: string, overrides: Partial<FeedInfo> = {}): FeedInfo {
  return {
    id,
    name: id,
    color: '#615DEC',
    memberCount: 0,
    ...overrides,
  };
}

describe('moveFeed', () => {
  it('reorders owned feeds without mixing shared feeds into the owned list', async () => {
    const sharedFeed = makeFeed('shared-feed', { isShared: true, followedFeedId: 'owner_shared-feed' });
    let ownedFeeds: FeedInfo[] = [
      makeFeed('__profile_viewers__', { isSystem: true, systemType: 'profileViewers' }),
      makeFeed('a'),
      makeFeed('b'),
    ];
    const sendMsg = vi.fn(async () => ({ success: true }));

    await moveFeed('a', 'b', {
      getFeeds: () => [...ownedFeeds, sharedFeed],
      setFeeds: (feeds) => {
        ownedFeeds = feeds;
      },
      getSharedFeeds: () => [sharedFeed],
      setSharedFeeds: vi.fn(),
      getActiveFeedTab: () => 'owned',
      sendMsg,
      showToast: vi.fn(),
      renderSidebarContent: vi.fn(),
    });

    expect(ownedFeeds.map((feed) => feed.id)).toEqual(['__profile_viewers__', 'b', 'a']);
    expect(ownedFeeds.some((feed) => feed.isShared)).toBe(false);
    expect(sendMsg).toHaveBeenCalledWith({
      type: 'FEEDS_REORDER',
      feedIds: ['b', 'a'],
    });
  });

  it('reorders shared feeds through followed feed ids', async () => {
    const setFeeds = vi.fn();
    let sharedFeeds: FeedInfo[] = [
      makeFeed('shared-a', { isShared: true, followedFeedId: 'owner_shared-a' }),
      makeFeed('shared-b', { isShared: true, followedFeedId: 'owner_shared-b' }),
    ];
    const sendMsg = vi.fn(async () => ({ success: true }));

    await moveFeed('shared-a', 'shared-b', {
      getFeeds: () => [makeFeed('owned'), ...sharedFeeds],
      setFeeds,
      getSharedFeeds: () => sharedFeeds,
      setSharedFeeds: (feeds) => {
        sharedFeeds = feeds;
      },
      getActiveFeedTab: () => 'shared',
      sendMsg,
      showToast: vi.fn(),
      renderSidebarContent: vi.fn(),
    });

    expect(setFeeds).not.toHaveBeenCalled();
    expect(sharedFeeds.map((feed) => feed.id)).toEqual(['shared-b', 'shared-a']);
    expect(sendMsg).toHaveBeenCalledWith({
      type: 'FEEDS_REORDER_SHARED',
      followedFeedIds: ['owner_shared-b', 'owner_shared-a'],
    });
  });
});
