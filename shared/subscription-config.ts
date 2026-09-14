export type ProBillingInterval = 'monthly' | 'annual';

export const PRO_PLAN_PRICING = {
  monthly: {
    price: 19,
    chargeLabel: '$19/month',
  },
  annual: {
    price: 156,
    monthlyEquivalent: 13,
    chargeLabel: '$156/year',
    savingsPercent: 32,
  },
} as const;

export const BILLING_FUNCTION_REGION = 'us-central1';

export const BILLING_FUNCTION_NAMES = {
  createCheckout: 'createBillingCheckout',
  getPortal: 'getBillingPortal',
};
