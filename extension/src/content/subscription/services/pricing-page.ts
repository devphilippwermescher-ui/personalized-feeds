export { PRICING_PAGE_URL } from 'shared/subscription-config';
import { sendBillingMessage } from './billing-message-client';

interface BillingActionResponse {
  success?: boolean;
  error?: string;
}

export async function openPricingPage(): Promise<void> {
  const response = await sendBillingMessage<BillingActionResponse>({ type: 'BILLING_OPEN_PRICING' });
  if (!response?.success) {
    throw new Error(response?.error || 'Unable to open pricing right now.');
  }
}
