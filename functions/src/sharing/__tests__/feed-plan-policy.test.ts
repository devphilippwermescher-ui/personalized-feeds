import { describe, expect, it } from 'vitest';
import { createFeedPlanPolicy } from '../feed-plan-policy.js';

describe('feed owner plan policy', () => {
  const feeds = ['first', 'second', 'third', 'fourth'];

  it('keeps only the first three Free feeds active and caps members at ten', () => {
    expect(createFeedPlanPolicy('free', feeds, 'third')).toEqual({
      ownerPlan: 'free',
      isFeedLocked: false,
      maxMembersPerFeed: 10,
    });
    expect(createFeedPlanPolicy('free', feeds, 'fourth')).toEqual({
      ownerPlan: 'free',
      isFeedLocked: true,
      maxMembersPerFeed: 10,
    });
  });

  it('does not impose feed or member limits for Pro owners', () => {
    expect(createFeedPlanPolicy('pro', feeds, 'fourth')).toEqual({
      ownerPlan: 'pro',
      isFeedLocked: false,
      maxMembersPerFeed: null,
    });
  });

  it('returns null for a feed that does not belong to the owner', () => {
    expect(createFeedPlanPolicy('free', feeds, 'missing')).toBeNull();
  });
});
