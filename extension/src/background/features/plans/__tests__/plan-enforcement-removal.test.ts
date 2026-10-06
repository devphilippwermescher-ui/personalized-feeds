import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedMember } from 'shared/types';

const mocks = vi.hoisted(() => ({
  getFeedMembers: vi.fn(),
  getFeedPlanPolicies: vi.fn(),
  removeMemberFromFeed: vi.fn(),
  syncFeedMemberCount: vi.fn(),
}));

vi.mock('shared/firestore-service', () => ({
  addMemberToFeed: vi.fn(),
  createFeed: vi.fn(),
  duplicateSharedFeed: vi.fn(),
  findExistingMemberInFeed: vi.fn(),
  getFeedMembers: mocks.getFeedMembers,
  getFeeds: vi.fn(),
  removeMemberFromFeed: mocks.removeMemberFromFeed,
  syncFeedMemberCount: mocks.syncFeedMemberCount,
  updateMemberInFeed: vi.fn(),
}));

vi.mock('../services/plan-service', () => ({
  getUserPlanSnapshot: vi.fn(),
}));

vi.mock('../../feed-sharing/public', () => ({
  getFeedPlanPolicies: mocks.getFeedPlanPolicies,
}));

import { removeFeedMemberForPlan } from '../services/plan-enforcement-service';

function member(id: string): FeedMember {
  return {
    id,
    linkedinUrl: `https://www.linkedin.com/in/${id}`,
    linkedinUsername: id,
    displayName: id,
    addedAt: 1,
  };
}

describe('shared-feed member removal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFeedPlanPolicies.mockResolvedValue({
      'owner-1/feed-1': {
        ownerPlan: 'free',
        isFeedLocked: false,
        maxMembersPerFeed: 10,
      },
    });
    mocks.removeMemberFromFeed.mockResolvedValue(undefined);
    mocks.syncFeedMemberCount.mockResolvedValue(undefined);
  });

  it('lets an editor remove a member when the free feed is at its ten-person limit', async () => {
    const members = Array.from({ length: 10 }, (_, index) => member(`member-${index + 1}`));
    mocks.getFeedMembers.mockResolvedValue(members);

    await removeFeedMemberForPlan('editor-1', 'owner-1', 'feed-1', 'member-1');

    expect(mocks.removeMemberFromFeed).toHaveBeenCalledWith('owner-1', 'feed-1', 'member-1');
    expect(mocks.syncFeedMemberCount).not.toHaveBeenCalled();
  });

  it('repairs the count when an earlier partial removal already deleted the member', async () => {
    const remainingMembers = Array.from({ length: 9 }, (_, index) => member(`member-${index + 2}`));
    mocks.getFeedMembers.mockResolvedValue(remainingMembers);

    await removeFeedMemberForPlan('editor-1', 'owner-1', 'feed-1', 'member-1');

    expect(mocks.removeMemberFromFeed).not.toHaveBeenCalled();
    expect(mocks.syncFeedMemberCount).toHaveBeenCalledWith('owner-1', 'feed-1', 9);
  });
});
