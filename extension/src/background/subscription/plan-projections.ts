import type { PlanEntitlements } from 'shared/plans';
import type { Feed, FeedMember } from 'shared/types';

export function projectFeedsForPlan(feeds: Feed[], entitlements: PlanEntitlements): Feed[] {
  const visibleFeeds = entitlements.maxCustomFeeds === null ? feeds : feeds.slice(0, entitlements.maxCustomFeeds);

  return visibleFeeds.map((feed) => ({
    ...feed,
    memberCount:
      entitlements.maxMembersPerFeed === null
        ? feed.memberCount
        : Math.min(feed.memberCount, entitlements.maxMembersPerFeed),
  }));
}

export function projectFeedMembersForPlan(members: FeedMember[], entitlements: PlanEntitlements): FeedMember[] {
  return entitlements.maxMembersPerFeed === null ? members : members.slice(0, entitlements.maxMembersPerFeed);
}
