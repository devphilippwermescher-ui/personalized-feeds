import { describe, it, expect, vi } from 'vitest';
import {
  getStaleFeedMemberCacheIds,
  loadFeedMembers,
  toggleFeedExpansion,
} from '../logic/feed-members';
import type { FeedInfo, FeedMemberInfo } from '../types';

function makeMember(id: string, status: FeedMemberInfo['status'] = 'connected'): FeedMemberInfo {
  return {
    id,
    linkedinUrl: `https://www.linkedin.com/in/${id}/`,
    linkedinUsername: id,
    displayName: `User ${id}`,
    status,
    addedAt: Date.now(),
  };
}

function makeFeed(id: string, overrides: Partial<FeedInfo> = {}): FeedInfo {
  return {
    id,
    name: `Feed ${id}`,
    description: '',
    color: '#615DEC',
    memberCount: 2,
    sortOrder: 0,
    isShared: false,
    ownerId: 'owner-1',
    ...overrides,
  };
}

type FeedMembersDeps = Parameters<typeof toggleFeedExpansion>[1];

function makeDeps(overrides: Partial<FeedMembersDeps> & {
  feedMembersById?: Record<string, FeedMemberInfo[]>;
  feeds?: FeedInfo[];
  expandedFeedId?: string | null;
}): FeedMembersDeps {
  let feedMembersById: Record<string, FeedMemberInfo[]> = overrides.feedMembersById ?? {};
  let expandedFeedId: string | null = overrides.expandedFeedId ?? null;
  const feeds: FeedInfo[] = overrides.feeds ?? [];

  return {
    sendMsg: vi.fn().mockResolvedValue({ members: [] }),
    renderSidebarContent: vi.fn(),
    fetchStatusesProgressively: vi.fn().mockResolvedValue(undefined),
    persistResolvedMemberState: vi.fn().mockResolvedValue(undefined),
    updateRenderedMemberState: vi.fn().mockReturnValue(true),
    getStatusFetchController: () => null,
    setStatusFetchController: vi.fn(),
    getLoadingMembersFeedId: () => null,
    setLoadingMembersFeedId: vi.fn(),
    getFeedMembersById: () => feedMembersById,
    setFeedMembersById: vi.fn((value: Record<string, FeedMemberInfo[]>) => {
      feedMembersById = { ...feedMembersById, ...value };
    }),
    getFeedMembersRetryState: () => ({}),
    setFeedMembersRetryState: vi.fn(),
    getExpandedFeedId: () => expandedFeedId,
    setExpandedFeedId: vi.fn((id: string | null) => {
      expandedFeedId = id;
    }),
    setActiveMemberEditor: vi.fn(),
    getFeeds: () => feeds,
    ...overrides,
  };
}

describe('toggleFeedExpansion status mutation wiring', () => {
  it('passes the freshly-created loading objects to fetchStatusesProgressively, not the old ones', async () => {
    const feedId = 'feed-1';
    const resolvedMember1 = makeMember('m1', 'connected');
    const resolvedMember2 = makeMember('m2', 'following');

    let capturedRefreshMembers: FeedMemberInfo[] = [];
    const deps = makeDeps({
      feedMembersById: { [feedId]: [resolvedMember1, resolvedMember2] },
      feeds: [makeFeed(feedId)],
      expandedFeedId: null,
      fetchStatusesProgressively: vi.fn((members, _onUpdate, _signal) => {
        capturedRefreshMembers = members as FeedMemberInfo[];
        return Promise.resolve();
      }),
    });

    await toggleFeedExpansion(feedId, deps);

    expect(capturedRefreshMembers).toHaveLength(2);
    expect(capturedRefreshMembers[0]).not.toBe(resolvedMember1);
    expect(capturedRefreshMembers[1]).not.toBe(resolvedMember2);

    expect(capturedRefreshMembers[0].status).toBe('loading');
    expect(capturedRefreshMembers[1].status).toBe('loading');
  });

  it('mutations by fetchStatusesProgressively are visible in feedMembersById', async () => {
    const feedId = 'feed-1';
    const m1 = makeMember('m1', 'connected');
    const m2 = makeMember('m2', 'following');

    let storedMembers: Record<string, FeedMemberInfo[]> = { [feedId]: [m1, m2] };
    const setFeedMembersById = vi.fn((value: Record<string, FeedMemberInfo[]>) => {
      storedMembers = { ...storedMembers, ...value };
    });

    const deps = makeDeps({
      feedMembersById: storedMembers,
      feeds: [makeFeed(feedId)],
      expandedFeedId: null,
      getFeedMembersById: () => storedMembers,
      setFeedMembersById,
      fetchStatusesProgressively: vi.fn((members: FeedMemberInfo[], onUpdate: (m: FeedMemberInfo) => void) => {
        for (const member of members) {
          member.status = 'connected';
          member.canMessage = true;
          onUpdate(member);
        }
        return Promise.resolve();
      }),
    });

    await toggleFeedExpansion(feedId, deps);

    expect(storedMembers[feedId][0].status).toBe('connected');
    expect(storedMembers[feedId][1].status).toBe('connected');
    expect(storedMembers[feedId][0].canMessage).toBe(true);
  });

  it('existing member statuses survive a subsequent renderSidebarContent call after new member added', async () => {
    const feedId = 'feed-1';
    const existingM1 = makeMember('m1', 'loading');
    const existingM2 = makeMember('m2', 'loading');

    let storedMembers: Record<string, FeedMemberInfo[]> = { [feedId]: [existingM1, existingM2] };
    const setFeedMembersById = vi.fn((value: Record<string, FeedMemberInfo[]>) => {
      storedMembers = { ...storedMembers, ...value };
    });

    const deps = makeDeps({
      feedMembersById: storedMembers,
      feeds: [makeFeed(feedId)],
      expandedFeedId: null,
      getFeedMembersById: () => storedMembers,
      setFeedMembersById,
      fetchStatusesProgressively: vi.fn((members: FeedMemberInfo[], onUpdate: (m: FeedMemberInfo) => void) => {
        for (const member of members) {
          member.status = 'connected';
          onUpdate(member);
        }
        return Promise.resolve();
      }),
    });

    await toggleFeedExpansion(feedId, deps);

    expect(storedMembers[feedId][0].status).toBe('connected');
    expect(storedMembers[feedId][1].status).toBe('connected');

    const newMember = makeMember('m3', 'loading');
    const existingMembers = storedMembers[feedId];
    storedMembers[feedId] = [...existingMembers, newMember];

    const snapshotAfterAdd = storedMembers[feedId];
    expect(snapshotAfterAdd[0].status).toBe('connected');
    expect(snapshotAfterAdd[1].status).toBe('connected');
    expect(snapshotAfterAdd[2].status).toBe('loading');
  });

  it('collapses an already-expanded feed without touching loading state', async () => {
    const feedId = 'feed-1';
    const m1 = makeMember('m1', 'connected');
    const storedMembers: Record<string, FeedMemberInfo[]> = { [feedId]: [m1] };
    const controller = new AbortController();
    const fetchProgressivelySpy = vi.fn().mockResolvedValue(undefined);

    const deps = makeDeps({
      feedMembersById: storedMembers,
      feeds: [makeFeed(feedId)],
      expandedFeedId: feedId,
      fetchStatusesProgressively: fetchProgressivelySpy,
      getStatusFetchController: () => controller,
    });

    await toggleFeedExpansion(feedId, deps);

    expect(deps.setExpandedFeedId).toHaveBeenCalledWith(null);
    expect(fetchProgressivelySpy).not.toHaveBeenCalled();
  });

  it('does not set loading state for a shared feed on re-expansion', async () => {
    const feedId = 'shared-feed';
    const m1 = makeMember('m1', 'connected');
    const storedMembers: Record<string, FeedMemberInfo[]> = { [feedId]: [m1] };
    const setFeedMembersById = vi.fn();

    const deps = makeDeps({
      feedMembersById: storedMembers,
      feeds: [makeFeed(feedId, { isShared: true, accessRole: 'reader' })],
      expandedFeedId: null,
      getFeedMembersById: () => storedMembers,
      setFeedMembersById,
    });

    await toggleFeedExpansion(feedId, deps);

    const loadingCall = setFeedMembersById.mock.calls.find((args) => {
      const members = (args[0] as Record<string, FeedMemberInfo[]>)[feedId];
      return members?.some((m) => m.status === 'loading');
    });
    expect(loadingCall).toBeUndefined();
  });

  it('does not reset resolved Profile Visitors statuses or refresh them on re-expansion', async () => {
    const feedId = 'profile-viewers';
    const m1 = makeMember('m1', 'connected');
    const m2 = makeMember('m2', 'following');
    m1.itemType = 'profile';
    m2.itemType = 'profile';
    m1.statusResolvedAt = Date.now();
    m2.statusResolvedAt = Date.now();
    const storedMembers: Record<string, FeedMemberInfo[]> = { [feedId]: [m1, m2] };
    const setFeedMembersById = vi.fn();
    const fetchProgressivelySpy = vi.fn().mockResolvedValue(undefined);

    const deps = makeDeps({
      feedMembersById: storedMembers,
      feeds: [
        makeFeed(feedId, {
          isSystem: true,
          systemType: 'profileViewers',
        }),
      ],
      expandedFeedId: null,
      getFeedMembersById: () => storedMembers,
      setFeedMembersById,
      fetchStatusesProgressively: fetchProgressivelySpy,
    });

    await toggleFeedExpansion(feedId, deps);

    expect(setFeedMembersById).not.toHaveBeenCalled();
    expect(fetchProgressivelySpy).not.toHaveBeenCalled();
    expect(storedMembers[feedId][0].status).toBe('connected');
    expect(storedMembers[feedId][1].status).toBe('following');
  });

  it('does not refresh unresolved Profile Visitors statuses on re-expansion', async () => {
    const feedId = 'profile-viewers';
    const resolved = makeMember('resolved', 'connected');
    const unresolved = makeMember('unresolved', 'loading');
    resolved.itemType = 'profile';
    unresolved.itemType = 'profile';
    resolved.statusResolvedAt = Date.now();
    const storedMembers: Record<string, FeedMemberInfo[]> = { [feedId]: [resolved, unresolved] };
    const fetchProgressivelySpy = vi.fn().mockResolvedValue(undefined);

    const deps = makeDeps({
      feedMembersById: storedMembers,
      feeds: [
        makeFeed(feedId, {
          isSystem: true,
          systemType: 'profileViewers',
        }),
      ],
      expandedFeedId: null,
      getFeedMembersById: () => storedMembers,
      fetchStatusesProgressively: fetchProgressivelySpy,
    });

    await toggleFeedExpansion(feedId, deps);

    expect(fetchProgressivelySpy).not.toHaveBeenCalled();
  });

});

describe('loadFeedMembers status mutation wiring', () => {
  it('passes the same member objects to fetchStatusesProgressively that are stored in feedMembersById', async () => {
    const feedId = 'feed-1';
    const feed = makeFeed(feedId);

    let storedMembers: Record<string, FeedMemberInfo[]> = {};
    const setFeedMembersById = vi.fn((value: Record<string, FeedMemberInfo[]>) => {
      storedMembers = { ...storedMembers, ...value };
    });

    let capturedRefreshMembers: FeedMemberInfo[] = [];
    const deps = makeDeps({
      feedMembersById: storedMembers,
      feeds: [feed],
      expandedFeedId: null,
      getFeedMembersById: () => storedMembers,
      setFeedMembersById,
      sendMsg: vi.fn().mockResolvedValue({
        members: [
          { id: 'm1', linkedinUsername: 'm1', linkedinUrl: '/in/m1', displayName: 'M1', status: 'connected', addedAt: 0 },
        ],
      }),
      fetchStatusesProgressively: vi.fn((members: FeedMemberInfo[]) => {
        capturedRefreshMembers = members;
        return Promise.resolve();
      }),
    });

    await loadFeedMembers(feedId, deps);

    expect(capturedRefreshMembers).toBe(storedMembers[feedId]);
    expect(capturedRefreshMembers[0]).toBe(storedMembers[feedId][0]);
  });

  it('refreshes Profile Visitors statuses through the same content resolver used by regular feeds', async () => {
    const feedId = 'profile-viewers';
    let storedMembers: Record<string, FeedMemberInfo[]> = {};
    let capturedRefreshMembers: FeedMemberInfo[] = [];
    const setFeedMembersById = vi.fn((value: Record<string, FeedMemberInfo[]>) => {
      storedMembers = { ...storedMembers, ...value };
    });
    const sendMsg = vi.fn((message: Record<string, unknown>) => {
      if (message.type === 'PROFILE_VIEWERS_GET') {
        return Promise.resolve({
          viewers: [
            {
              id: 'viewer-1',
              linkedinUrl: 'https://www.linkedin.com/in/viewer-1/',
              linkedinUsername: 'viewer-1',
              displayName: 'Viewer One',
              source: 'linkedin_profile_views',
              firstSeenAt: 1,
              lastSeenAt: 2,
            },
          ],
          summary: null,
        });
      }

      return Promise.resolve({ success: true, queued: true });
    });
    const fetchStatusesProgressively = vi.fn((members: FeedMemberInfo[]) => {
      capturedRefreshMembers = members;
      return Promise.resolve();
    });

    const deps = makeDeps({
      feedMembersById: storedMembers,
      feeds: [
        makeFeed(feedId, {
          isSystem: true,
          systemType: 'profileViewers',
          memberCount: 1,
        }),
      ],
      getFeedMembersById: () => storedMembers,
      setFeedMembersById,
      sendMsg,
      fetchStatusesProgressively,
    });

    await loadFeedMembers(feedId, deps);

    expect(sendMsg).toHaveBeenCalledWith({ type: 'PROFILE_VIEWERS_GET' });
    expect(sendMsg).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'PROFILE_VIEWERS_STATUS_SYNC_QUEUE',
    }));
    expect(fetchStatusesProgressively).toHaveBeenCalledTimes(1);
    const fetchStatusCalls = fetchStatusesProgressively.mock.calls as unknown as Array<
      [FeedMemberInfo[], (member: FeedMemberInfo) => void, AbortSignal, { preserveExistingPremium?: boolean }]
    >;
    expect(fetchStatusCalls[0]?.[3]).toEqual({
      preserveExistingPremium: true,
    });
    expect(capturedRefreshMembers).toBe(storedMembers[feedId]);
    expect(capturedRefreshMembers[0]).toMatchObject({
      id: 'viewer-1',
      linkedinUsername: 'viewer-1',
      itemType: 'profile',
    });
  });
});

describe('adding a new member does not reset existing member statuses', () => {
  it('existing resolved statuses are preserved in feedMembersById after a new member is appended', async () => {
    const feedId = 'feed-1';
    const m1 = makeMember('m1', 'connected');
    const m2 = makeMember('m2', 'following');

    let storedMembers: Record<string, FeedMemberInfo[]> = { [feedId]: [m1, m2] };
    const setFeedMembersById = vi.fn((value: Record<string, FeedMemberInfo[]>) => {
      storedMembers = { ...storedMembers, ...value };
    });

    const deps = makeDeps({
      feedMembersById: storedMembers,
      feeds: [makeFeed(feedId)],
      expandedFeedId: null,
      getFeedMembersById: () => storedMembers,
      setFeedMembersById,
      fetchStatusesProgressively: vi.fn((members: FeedMemberInfo[], onUpdate: (m: FeedMemberInfo) => void) => {
        for (const member of members) {
          member.status = member.id === 'm1' ? 'connected' : 'following';
          onUpdate(member);
        }
        return Promise.resolve();
      }),
    });

    await toggleFeedExpansion(feedId, deps);

    const newMember = makeMember('m3', 'loading');
    storedMembers[feedId] = [...storedMembers[feedId], newMember];

    const members = storedMembers[feedId];
    expect(members[0].status).toBe('connected');
    expect(members[1].status).toBe('following');
    expect(members[2].status).toBe('loading');
  });
});

describe('getStaleFeedMemberCacheIds', () => {
  it('invalidates a cached list when Firestore memberCount has changed', () => {
    const feed = makeFeed('feed-1', { memberCount: 4 });
    const cachedMembers = [makeMember('m1'), makeMember('m2'), makeMember('m3')];

    expect(getStaleFeedMemberCacheIds([feed], {
      [feed.id]: cachedMembers,
    })).toEqual([feed.id]);
  });

  it('keeps a complete cache and ignores caches that have not been loaded', () => {
    const completeFeed = makeFeed('feed-1', { memberCount: 3 });
    const unloadedFeed = makeFeed('feed-2', { memberCount: 4 });

    expect(getStaleFeedMemberCacheIds([completeFeed, unloadedFeed], {
      [completeFeed.id]: [makeMember('m1'), makeMember('m2'), makeMember('m3')],
    })).toEqual([]);
  });

  it('does not treat the profile viewers system feed as a regular member cache', () => {
    const feed = makeFeed('profile-viewers', {
      memberCount: 10,
      isSystem: true,
      systemType: 'profileViewers',
    });

    expect(getStaleFeedMemberCacheIds([feed], {
      [feed.id]: [makeMember('m1')],
    })).toEqual([]);
  });
});
