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

    expect(projected).toHaveLength(5);
    expect(projected.map((feed) => feed.memberCount)).toEqual([25, 25, 25, 25, 25]);
    expect(projected.map((feed) => feed.activeMemberCount)).toEqual([10, 10, 10, 0, 0]);
    expect(projected.map((feed) => feed.lockedMemberCount)).toEqual([15, 15, 15, 25, 25]);
    expect(projected.map((feed) => feed.isLockedByPlan)).toEqual([false, false, false, true, true]);
    expect(feeds).toHaveLength(5);
    expect(feeds[0].memberCount).toBe(25);
  });

  it('restores the complete feed and member view for Pro', () => {
    const feeds = Array.from({ length: 5 }, (_, index) => makeFeed(index, 25));
    const members = Array.from({ length: 20 }, (_, index) => makeMember(index));

    expect(projectFeedsForPlan(feeds, getPlanEntitlements('pro'))).toEqual(feeds);
    expect(projectFeedMembersForPlan(members, getPlanEntitlements('pro'))).toEqual(members);
  });

  it('keeps overflow members visible but marks everything after the newest 10 as locked', () => {
    const members = Array.from({ length: 20 }, (_, index) => makeMember(index));
    const projected = projectFeedMembersForPlan(members, getPlanEntitlements('free'));

    expect(projected).toHaveLength(20);
    expect(projected.slice(0, 10).every((member) => member.isLockedByPlan === false)).toBe(true);
    expect(projected.slice(10).every((member) => member.isLockedByPlan === true)).toBe(true);
    expect(members).toHaveLength(20);
  });

  it('locks every member when the entire feed is outside the owner plan window', () => {
    const members = Array.from({ length: 4 }, (_, index) => makeMember(index));
    const projected = projectFeedMembersForPlan(members, getPlanEntitlements('free'), true);

    expect(projected.every((member) => member.isLockedByPlan)).toBe(true);
  });
});
