import { describe, expect, it } from 'vitest';
import { getPlanEntitlements } from 'shared/plans';
import type { Feed, FeedMember } from 'shared/types';
import { projectFeedMembersForPlan, projectFeedsForPlan } from '../utils/plan-projections';

function makeFeed(index: number, memberCount: number): Feed {
  return {
    id: `feed-${index}`,
    name: `Feed ${index}`,
    description: '',
    color: '#615DEC',
    memberCount,
    createdAt: index,
    updatedAt: index,
    sortOrder: index,
    ownerId: 'user-1',
  };
}

function makeMember(index: number): FeedMember {
  return {
    id: `member-${index}`,
    linkedinUrl: `https://www.linkedin.com/in/member-${index}/`,
    linkedinUsername: `member-${index}`,
    displayName: `Member ${index}`,
    headline: '',
    profileImageUrl: '',
    company: '',
    location: '',
    connectionDegree: '',
    addedAt: index,
  };
}

describe('plan projections', () => {
  it('projects legacy data into the Free window without mutating the source', () => {
    const feeds = Array.from({ length: 5 }, (_, index) => makeFeed(index, 25));
    const projected = projectFeedsForPlan(feeds, getPlanEntitlements('free'));

    expect(projected).toHaveLength(3);
    expect(projected.map((feed) => feed.memberCount)).toEqual([15, 15, 15]);
    expect(feeds).toHaveLength(5);
    expect(feeds[0].memberCount).toBe(25);
  });

  it('restores the complete feed and member view for Pro', () => {
    const feeds = Array.from({ length: 5 }, (_, index) => makeFeed(index, 25));
    const members = Array.from({ length: 20 }, (_, index) => makeMember(index));

    expect(projectFeedsForPlan(feeds, getPlanEntitlements('pro'))).toEqual(feeds);
    expect(projectFeedMembersForPlan(members, getPlanEntitlements('pro'))).toEqual(members);
  });

  it('shows only the newest 15 persisted feed members to Free users', () => {
    const members = Array.from({ length: 20 }, (_, index) => makeMember(index));
    const projected = projectFeedMembersForPlan(members, getPlanEntitlements('free'));

    expect(projected.map((member) => member.id)).toEqual(members.slice(0, 15).map((member) => member.id));
    expect(members).toHaveLength(20);
  });
});
