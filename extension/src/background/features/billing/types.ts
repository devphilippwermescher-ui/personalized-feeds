import type { BillingSubscription } from 'shared/plans';
import type { ProBillingInterval } from 'shared/subscription-config';

export type BillingMessage =
  | { type: 'BILLING_OPEN_CHECKOUT'; interval: ProBillingInterval }
  | { type: 'BILLING_OPEN_PORTAL' };

export interface BillingActionResponse {
  success: boolean;
  error?: string;
}

export interface PlanResponse {
  success: boolean;
  plan: 'free' | 'pro' | null;
  subscription: BillingSubscription | null;
  error?: string;
}
