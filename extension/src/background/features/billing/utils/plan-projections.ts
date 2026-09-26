import type { PlanEntitlements } from 'shared/plans';
import type { Feed, FeedMember, FeedPlanPolicy } from 'shared/types';

function projectFeed(feed: Feed, isLockedByPlan: boolean, maxMembersPerFeed: number | null): Feed {
  if (!isLockedByPlan && maxMembersPerFeed === null) {
    return feed;
  }
  const activeMemberCount = isLockedByPlan
    ? 0
    : maxMembersPerFeed === null
      ? feed.memberCount
      : Math.min(feed.memberCount, maxMembersPerFeed);
  return {
    ...feed,
    activeMemberCount,
    lockedMemberCount: Math.max(0, feed.memberCount - activeMemberCount),
    isLockedByPlan,
  };
}

export function projectFeedsForPlan(feeds: Feed[], entitlements: PlanEntitlements): Feed[] {
  return feeds.map((feed, index) =>
    projectFeed(
      feed,
      entitlements.maxCustomFeeds !== null && index >= entitlements.maxCustomFeeds,
      entitlements.maxMembersPerFeed
    )
  );
}

export function projectFeedMembersForPlan(
  members: FeedMember[],
  entitlements: PlanEntitlements,
  isFeedLocked = false
): FeedMember[] {
  if (!isFeedLocked && entitlements.maxMembersPerFeed === null) {
    return members;
  }
  return members.map((member, index) => ({
    ...member,
    isLockedByPlan:
      isFeedLocked || (entitlements.maxMembersPerFeed !== null && index >= entitlements.maxMembersPerFeed),
  }));
}

export function projectFeedForOwnerPolicy(feed: Feed, policy: FeedPlanPolicy): Feed {
  return projectFeed(feed, policy.isFeedLocked, policy.maxMembersPerFeed);
}
