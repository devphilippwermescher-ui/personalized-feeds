/**
 * Tests for Bug 2: adding one new person makes all badges go into Loading.
 *
 * Root cause: toggleFeedExpansion creates NEW member objects with `loading`
 * status and stores them in feedMembersById, but then passes the ORIGINAL
 * cachedMembers array to startBackgroundStatusRefresh.
 * fetchStatusesProgressively mutates the objects it receives in-place; those
 * mutations land on the ORIGINAL objects which are no longer in
 * feedMembersById — so feedMembersById permanently holds stale `loading`
 * statuses after re-expansion.
 *
 * When handleExternalMemberAdded subsequently calls renderSidebarContent(),
 * it reads feedMembersById (all loading) and the whole list appears as loading.
 *
 * Fix: toggleFeedExpansion now captures the new loading-member array and
 * passes that — not the original cachedMembers — to startBackgroundStatusRefresh.
 */

import { describe, it, expect, vi } from 'vitest';
import { toggleFeedExpansion, loadFeedMembers } from '../logic/feed-members';
import type { FeedInfo, FeedMemberInfo } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

// ── Bug 2: toggleFeedExpansion passes new objects to background refresh ────────

describe('toggleFeedExpansion — status-mutation wiring', () => {
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

    // The members passed to fetchStatusesProgressively must be the NEW objects
    // (not the original resolvedMember1/2 references) because setFeedMembersById
    // was called with a new mapped array.
    expect(capturedRefreshMembers).toHaveLength(2);
    expect(capturedRefreshMembers[0]).not.toBe(resolvedMember1);
    expect(capturedRefreshMembers[1]).not.toBe(resolvedMember2);

    // They should start with loading status (the initial state before refresh).
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
        // Simulate what fetchStatusesProgressively does: mutate members in-place.
        for (const member of members) {
          member.status = 'connected';
          member.canMessage = true;
          onUpdate(member);
        }
        return Promise.resolve();
      }),
    });

    await toggleFeedExpansion(feedId, deps);

    // After the refresh simulates mutations, feedMembersById must reflect them.
    expect(storedMembers[feedId][0].status).toBe('connected');
    expect(storedMembers[feedId][1].status).toBe('connected');
    expect(storedMembers[feedId][0].canMessage).toBe(true);
  });

  it('existing member statuses survive a subsequent renderSidebarContent call after new member added', async () => {
    /**
     * Simulates the full sequence:
     * 1. feed expanded → toggleFeedExpansion → new loading objects stored in feedMembersById
     * 2. fetchStatusesProgressively resolves statuses in-place
     * 3. handleExternalMemberAdded appends new member
     * 4. renderSidebarContent is called → feedMembersById should NOT have stale 'loading'
     */
    const feedId = 'feed-1';
    const existingM1 = makeMember('m1', 'loading'); // starts as loading
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

    // Step 1+2: expand feed, statuses resolved
    await toggleFeedExpansion(feedId, deps);

    // Verify: feedMembersById has resolved statuses
    expect(storedMembers[feedId][0].status).toBe('connected');
    expect(storedMembers[feedId][1].status).toBe('connected');

    // Step 3: simulate handleExternalMemberAdded appending a new member
    const newMember = makeMember('m3', 'loading');
    const existingMembers = storedMembers[feedId];
    storedMembers[feedId] = [...existingMembers, newMember];

    // Step 4: after append, existing members should still have resolved statuses
    const snapshotAfterAdd = storedMembers[feedId];
    expect(snapshotAfterAdd[0].status).toBe('connected');
    expect(snapshotAfterAdd[1].status).toBe('connected');
    expect(snapshotAfterAdd[2].status).toBe('loading'); // only new member is loading
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
      expandedFeedId: feedId, // already expanded
      fetchStatusesProgressively: fetchProgressivelySpy,
      getStatusFetchController: () => controller,
    });

    await toggleFeedExpansion(feedId, deps);

    // Should collapse (setExpandedFeedId(null)) and NOT start a background refresh.
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

    // setFeedMembersById should NOT be called with loading-state members for shared feeds.
    const loadingCall = setFeedMembersById.mock.calls.find((args) => {
      const members = (args[0] as Record<string, FeedMemberInfo[]>)[feedId];
      return members?.some((m) => m.status === 'loading');
    });
    expect(loadingCall).toBeUndefined();
  });
});

// ── loadFeedMembers — parity check: members passed to refresh are the stored array ──

describe('loadFeedMembers — status-mutation wiring', () => {
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

    // The members in feedMembersById and those passed to refresh must be the same objects.
    expect(capturedRefreshMembers).toBe(storedMembers[feedId]);
    expect(capturedRefreshMembers[0]).toBe(storedMembers[feedId][0]);
  });
});

// ── Regression: add-only member does not flip all badges to loading ──────────

describe('adding a new member does not reset existing member statuses', () => {
  it('existing resolved statuses are preserved in feedMembersById after a new member is appended', async () => {
    /**
     * This test validates the absence of the regression:
     *  Before fix: feedMembersById would have stale `loading` for all members
     *   after toggleFeedExpansion, so appending a new member and reading
     *   feedMembersById would show all-loading.
     *  After fix: fetchStatusesProgressively mutates the new objects that are
     *   IN feedMembersById, so after refresh feedMembersById has resolved
     *   statuses for existing members.
     */
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
        // Simulate full resolution: restore the statuses that the UI had shown.
        for (const member of members) {
          member.status = member.id === 'm1' ? 'connected' : 'following';
          onUpdate(member);
        }
        return Promise.resolve();
      }),
    });

    await toggleFeedExpansion(feedId, deps);

    // Append new member (simulating handleExternalMemberAdded)
    const newMember = makeMember('m3', 'loading');
    storedMembers[feedId] = [...storedMembers[feedId], newMember];

    // Read state as renderSidebarContent would see it
    const members = storedMembers[feedId];
    expect(members[0].status).toBe('connected');   // existing member — NOT loading
    expect(members[1].status).toBe('following');   // existing member — NOT loading
    expect(members[2].status).toBe('loading');     // only the newly-added member is loading
  });
});
