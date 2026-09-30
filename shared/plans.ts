export type AppPlan = 'free' | 'pro';

export interface PlanEntitlements {
  maxCustomFeeds: number | null;
  maxMembersPerFeed: number | null;
  maxOutgoingShareRecipients: number | null;
  maxOutgoingSharedFeeds: number | null;
  maxIncomingShareOwners: number | null;
  maxIncomingSharedFeeds: number | null;
  maxVisibleProfileViewers: number | null;
  collectAllVisibleProfileViewers: boolean;
  collectPrivateProfileViewers: boolean;
  collectRecruiterProfileViewers: boolean;
}

export interface UserPlanSnapshot {
  plan: AppPlan;
  entitlements: PlanEntitlements;
}

export const PLAN_ENTITLEMENTS: Record<AppPlan, PlanEntitlements> = {
  free: {
    maxCustomFeeds: 3,
    maxMembersPerFeed: 10,
    maxOutgoingShareRecipients: 1,
    maxOutgoingSharedFeeds: 3,
    maxIncomingShareOwners: 1,
    maxIncomingSharedFeeds: 3,
    maxVisibleProfileViewers: 10,
    collectAllVisibleProfileViewers: false,
    collectPrivateProfileViewers: false,
    collectRecruiterProfileViewers: false,
  },
  pro: {
    maxCustomFeeds: null,
    maxMembersPerFeed: null,
    maxOutgoingShareRecipients: null,
    maxOutgoingSharedFeeds: null,
    maxIncomingShareOwners: null,
    maxIncomingSharedFeeds: null,
    maxVisibleProfileViewers: null,
    collectAllVisibleProfileViewers: true,
    collectPrivateProfileViewers: true,
    collectRecruiterProfileViewers: true,
  },
};

export function getPlanEntitlements(plan: AppPlan): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

export function createFreePlanSnapshot(): UserPlanSnapshot {
  return {
    plan: 'free',
    entitlements: getPlanEntitlements('free'),
  };
}

export function isPlanLimitReached(currentCount: number, limit: number | null): boolean {
  return limit !== null && currentCount >= limit;
}
