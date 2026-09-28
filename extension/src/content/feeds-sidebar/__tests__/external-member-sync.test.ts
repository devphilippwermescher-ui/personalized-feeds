import { describe, expect, it, vi } from 'vitest';
import { applyRealtimeFeedMembers, insertAddedMemberIntoCache } from '../logic/external-member-sync';
import type { FeedInfo, FeedMemberInfo } from '../types';

function member(overrides: Partial<FeedMemberInfo>): FeedMemberInfo {
  const linkedinUsername = overrides.linkedinUsername || overrides.id || 'member-id';
  return {
    id: 'member-id',
    linkedinUrl: `https://www.linkedin.com/in/${linkedinUsername}/`,
    linkedinUsername,
    displayName: 'Member',
    addedAt: 100,
    ...overrides,
  };
}

describe('insertAddedMemberIntoCache', () => {
  it('places a newly added member by newest addedAt first', () => {
    const first = member({
      id: 'old-1',
      linkedinUsername: 'old-1',
      addedAt: 200,
      status: 'connected',
    });
    const second = member({
      id: 'old-2',
      linkedinUsername: 'old-2',
      addedAt: 100,
      status: 'following',
    });
    const incoming = member({
      id: 'new-1',
      linkedinUsername: 'new-1',
      addedAt: 300,
      status: 'loading',
    });

    const result = insertAddedMemberIntoCache([first, second], incoming);

    expect(result.map((item) => item.id)).toEqual(['new-1', 'old-1', 'old-2']);
    expect(result[1].status).toBe('connected');
    expect(result[2].status).toBe('following');
  });

  it('does not duplicate an existing member matched by username', () => {
    const existing = member({
      id: 'existing-id',
      linkedinUsername: 'same-user',
      addedAt: 100,
    });
    const incoming = member({
      id: 'new-doc-id',
      linkedinUsername: 'same-user',
      addedAt: 200,
    });

    const result = insertAddedMemberIntoCache([existing], incoming);

    expect(result).toEqual([existing]);
  });
});

describe('applyRealtimeFeedMembers', () => {
  it('updates an opened owner feed when an editor deletes a member', () => {
    let feeds: FeedInfo[] = [
      {
        id: 'feed',
        name: 'Shared feed',
        color: '#fff',
        memberCount: 10,
        activeMemberCount: 10,
        lockedMemberCount: 0,
        ownerId: 'owner',
      },
    ];
    let membersByFeed: Record<string, FeedMemberInfo[]> = {
      feed: Array.from({ length: 10 }, (_, index) =>
        member({ id: `member-${index}`, linkedinUsername: `member-${index}` })
      ),
    };
    const remainingMembers = membersByFeed.feed.slice(0, 9);
    const renderSidebarContent = vi.fn();
    const updateRenderedMemberState = vi.fn().mockReturnValue(true);

    const applied = applyRealtimeFeedMembers(
      { ownerId: 'owner', feedId: 'feed', memberCount: 9, members: remainingMembers },
      {
        getFeeds: () => feeds,
        setFeeds: (value) => {
          feeds = value;
        },
        getSharedFeeds: () => [],
        setSharedFeeds: vi.fn(),
        getFeedMembersById: () => membersByFeed,
        setFeedMembersById: (value) => {
          membersByFeed = value;
        },
        getExpandedFeedId: () => 'feed',
        updateRenderedMemberState,
        getActiveMemberEditor: () => null,
        setActiveMemberEditor: vi.fn(),
        renderSidebarContent,
      }
    );

    expect(applied).toBe(true);
    expect(feeds[0]).toEqual(expect.objectContaining({ memberCount: 9, activeMemberCount: 9, lockedMemberCount: 0 }));
    expect(membersByFeed.feed).toHaveLength(9);
    expect(updateRenderedMemberState).not.toHaveBeenCalled();
    expect(renderSidebarContent).toHaveBeenCalledOnce();
  });

  it('patches status-only updates in an expanded feed without re-rendering the sidebar', () => {
    let feeds: FeedInfo[] = [
      {
        id: 'feed',
        name: 'Feed',
        color: '#fff',
        memberCount: 1,
        ownerId: 'owner',
      },
    ];
    let membersByFeed: Record<string, FeedMemberInfo[]> = {
      feed: [member({ id: 'member-1', linkedinUsername: 'member-1', status: 'connect' })],
    };
    const nextMember = member({ id: 'member-1', linkedinUsername: 'member-1', status: 'pending' });
    const updateRenderedMemberState = vi.fn().mockReturnValue(true);
    const renderSidebarContent = vi.fn();

    const applied = applyRealtimeFeedMembers(
      { ownerId: 'owner', feedId: 'feed', memberCount: 1, members: [nextMember] },
      {
        getFeeds: () => feeds,
        setFeeds: (value) => {
          feeds = value;
        },
        getSharedFeeds: () => [],
        setSharedFeeds: vi.fn(),
        getFeedMembersById: () => membersByFeed,
        setFeedMembersById: (value) => {
          membersByFeed = value;
        },
        getExpandedFeedId: () => 'feed',
        updateRenderedMemberState,
        getActiveMemberEditor: () => null,
        setActiveMemberEditor: vi.fn(),
        renderSidebarContent,
      }
    );

    expect(applied).toBe(true);
    expect(membersByFeed.feed).toEqual([nextMember]);
    expect(updateRenderedMemberState).toHaveBeenCalledWith('feed', nextMember);
    expect(renderSidebarContent).not.toHaveBeenCalled();
  });

  it('falls back to a full render when an expanded member row is unavailable', () => {
    let membersByFeed: Record<string, FeedMemberInfo[]> = {
      feed: [member({ id: 'member-1', linkedinUsername: 'member-1', status: 'connect' })],
    };
    const renderSidebarContent = vi.fn();

    applyRealtimeFeedMembers(
      {
        ownerId: 'owner',
        feedId: 'feed',
        memberCount: 1,
        members: [member({ id: 'member-1', linkedinUsername: 'member-1', status: 'pending' })],
      },
      {
        getFeeds: () => [{ id: 'feed', name: 'Feed', color: '#fff', memberCount: 1, ownerId: 'owner' }],
        setFeeds: vi.fn(),
        getSharedFeeds: () => [],
        setSharedFeeds: vi.fn(),
        getFeedMembersById: () => membersByFeed,
        setFeedMembersById: (value) => {
          membersByFeed = value;
        },
        getExpandedFeedId: () => 'feed',
        updateRenderedMemberState: vi.fn().mockReturnValue(false),
        getActiveMemberEditor: () => null,
        setActiveMemberEditor: vi.fn(),
        renderSidebarContent,
      }
    );

    expect(renderSidebarContent).toHaveBeenCalledOnce();
  });

  it('does not re-render the active feed for a late status update from a collapsed feed', () => {
    let membersByFeed: Record<string, FeedMemberInfo[]> = {
      'collapsed-feed': [
        member({
          id: 'member-1',
          linkedinUsername: 'member-1',
          status: 'connect',
          profileImageUrl: 'https://media.licdn.com/member-1.jpg',
        }),
      ],
    };
    const renderSidebarContent = vi.fn();
    const updateRenderedMemberState = vi.fn();

    applyRealtimeFeedMembers(
      {
        ownerId: 'owner',
        feedId: 'collapsed-feed',
        memberCount: 1,
        members: [
          member({
            id: 'member-1',
            linkedinUsername: 'member-1',
            status: 'pending',
            profileImageUrl: 'https://media.licdn.com/member-1.jpg',
          }),
        ],
      },
      {
        getFeeds: () => [
          { id: 'collapsed-feed', name: 'Collapsed', color: '#fff', memberCount: 1, ownerId: 'owner' },
          { id: 'active-feed', name: 'Active', color: '#fff', memberCount: 2, ownerId: 'owner' },
        ],
        setFeeds: vi.fn(),
        getSharedFeeds: () => [],
        setSharedFeeds: vi.fn(),
        getFeedMembersById: () => membersByFeed,
        setFeedMembersById: (value) => {
          membersByFeed = value;
        },
        getExpandedFeedId: () => 'active-feed',
        updateRenderedMemberState,
        getActiveMemberEditor: () => null,
        setActiveMemberEditor: vi.fn(),
        renderSidebarContent,
      }
    );

    expect(membersByFeed['collapsed-feed'][0].status).toBe('pending');
    expect(updateRenderedMemberState).not.toHaveBeenCalled();
    expect(renderSidebarContent).not.toHaveBeenCalled();
  });
});
