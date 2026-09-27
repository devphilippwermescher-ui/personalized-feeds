import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedFeedsUser: vi.fn(),
  onAuthChange: vi.fn(),
  projectFeedMembersForPlanAccess: vi.fn(),
  subscribeFeedMembers: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('shared/firestore-service', () => ({ subscribeFeedMembers: mocks.subscribeFeedMembers }));
vi.mock('../../../../services/auth', () => ({ onAuthChange: mocks.onAuthChange }));
vi.mock('../../auth/services/authenticated-user', () => ({
  getAuthenticatedFeedsUser: mocks.getAuthenticatedFeedsUser,
}));
vi.mock('../../plans/public', () => ({
  projectFeedMembersForPlanAccess: mocks.projectFeedMembersForPlanAccess,
}));

import { startFeedMembersRuntime, stopAllFeedMembersRuntime } from '../services/feed-members-runtime';

describe('feed members realtime runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedFeedsUser.mockResolvedValue({ uid: 'recipient' });
    mocks.subscribeFeedMembers.mockReturnValue(mocks.unsubscribe);
    mocks.projectFeedMembersForPlanAccess.mockImplementation(async (_viewer, _owner, _feed, members) => members);
    vi.stubGlobal('chrome', {
      tabs: {
        sendMessage: vi.fn(async () => undefined),
        onRemoved: { addListener: vi.fn() },
      },
    });
  });

  afterEach(() => {
    stopAllFeedMembersRuntime();
    vi.unstubAllGlobals();
  });

  it('pushes a projected member snapshot to the watching tab', async () => {
    await startFeedMembersRuntime('owner', 'feed', 7);
    const onMembers = mocks.subscribeFeedMembers.mock.calls[0]?.[2] as
      | ((members: Array<Record<string, unknown>>) => void)
      | undefined;
    const members = [{ id: 'member-1', displayName: 'Member' }];

    onMembers?.(members);

    await vi.waitFor(() =>
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
        type: 'FEEDS_MEMBERS_UPDATED',
        ownerId: 'owner',
        feedId: 'feed',
        memberCount: 1,
        members,
      })
    );
  });
});
