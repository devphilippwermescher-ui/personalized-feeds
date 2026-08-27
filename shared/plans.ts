export type AppPlan = 'free' | 'pro';

export interface PlanEntitlements {
  maxCustomFeeds: number | null;
  maxMembersPerFeed: number | null;
  maxVisibleProfileViewers: number | null;
  collectAllVisibleProfileViewers: boolean;
  collectPrivateProfileViewers: boolean;
  collectRecruiterProfileViewers: boolean;
}

export interface BillingSubscription {
  plan?: AppPlan;
  status?: string;
  source?: 'lemon_squeezy' | 'manual' | 'development';
  customerId?: string;
  subscriptionId?: string;
  variantId?: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  updatedAt?: number;
}

export interface UserPlanSnapshot {
  plan: AppPlan;
  entitlements: PlanEntitlements;
  subscription: BillingSubscription | null;
}

export const PLAN_ENTITLEMENTS: Record<AppPlan, PlanEntitlements> = {
  free: {
    maxCustomFeeds: 3,
    maxMembersPerFeed: 15,
    maxVisibleProfileViewers: 10,
    collectAllVisibleProfileViewers: false,
    collectPrivateProfileViewers: false,
    collectRecruiterProfileViewers: false,
  },
  pro: {
    maxCustomFeeds: null,
    maxMembersPerFeed: null,
    maxVisibleProfileViewers: null,
    collectAllVisibleProfileViewers: true,
    collectPrivateProfileViewers: true,
    collectRecruiterProfileViewers: true,
  },
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'on_trial', 'trialing']);

export function resolveAppPlan(subscription: BillingSubscription | null | undefined): AppPlan {
  return subscription?.plan === 'pro' && ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status || '') ? 'pro' : 'free';
}

export function getPlanEntitlements(plan: AppPlan): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

export function createUserPlanSnapshot(subscription: BillingSubscription | null | undefined): UserPlanSnapshot {
  const plan = resolveAppPlan(subscription);
  return {
    plan,
    entitlements: getPlanEntitlements(plan),
    subscription: subscription || null,
  };
}

export function isPlanLimitReached(currentCount: number, limit: number | null): boolean {
  return limit !== null && currentCount >= limit;
}
