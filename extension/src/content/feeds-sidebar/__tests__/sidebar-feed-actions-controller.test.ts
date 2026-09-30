import { describe, expect, it, vi } from 'vitest';
import { createSidebarFeedActionsController } from '../controllers/sidebar-feed-actions-controller';
import type { FeedInfo } from '../types';

function makeFeed(id: string, options: Partial<FeedInfo> = {}): FeedInfo {
  return {
    id,
    name: id,
    color: '#615DEC',
    memberCount: 0,
    ...options,
  };
}

describe('sidebar feed actions controller', () => {
  it('keeps shared feeds out of the mutable owned-feed state', () => {
    let ownedFeeds = [makeFeed('owned')];
    const sharedFeeds = [makeFeed('shared', { isShared: true, ownerId: 'other-user' })];

    const controller = createSidebarFeedActionsController({
      sendMsg: vi.fn(),
      renderSidebarContent: vi.fn(),
      openSidebar: vi.fn(),
      loadFeeds: vi.fn(),
      loadFeedMembers: vi.fn(),
      getFeeds: () => ownedFeeds,
      setFeeds: (feeds) => {
        ownedFeeds = feeds;
      },
      getSharedFeeds: () => sharedFeeds,
      setSharedFeeds: vi.fn(),
      getActiveFeedTab: () => 'owned',
      selectFeedTab: vi.fn(),
      getExpandedFeedId: () => null,
      setExpandedFeedId: vi.fn(),
      getFeedMembersById: () => ({}),
      setFeedMembersById: vi.fn(),
      getCurrentPlan: () => 'free',
      updateRenderedMemberState: () => false,
      getActiveMemberEditor: () => null,
      setActiveMemberEditor: vi.fn(),
      onModalClosed: vi.fn(),
    });

    const actionDeps = controller.getFeedActionDeps();

    expect(actionDeps.getFeeds().map((feed) => feed.id)).toEqual(['owned']);
    expect(actionDeps.getSharedFeeds().map((feed) => feed.id)).toEqual(['shared']);

    actionDeps.setFeeds(actionDeps.getFeeds().map((feed) => ({ ...feed, name: 'Renamed owned feed' })));

    expect(ownedFeeds).toEqual([expect.objectContaining({ id: 'owned', name: 'Renamed owned feed' })]);
  });
});
