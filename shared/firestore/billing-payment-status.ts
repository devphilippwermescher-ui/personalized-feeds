import { getDoc, onSnapshot } from 'firebase/firestore';
import type { BillingPaymentStatus } from '../billing-payment-status';
import { billingPaymentStatusDoc } from './refs';

export async function getBillingPaymentStatus(userId: string): Promise<BillingPaymentStatus | null> {
  const snapshot = await getDoc(billingPaymentStatusDoc(userId));
  return snapshot.exists() ? (snapshot.data() as BillingPaymentStatus) : null;
}

export function subscribeBillingPaymentStatus(
  userId: string,
  onPaymentStatus: (status: BillingPaymentStatus | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    billingPaymentStatusDoc(userId),
    (snapshot) => {
      onPaymentStatus(snapshot.exists() ? (snapshot.data() as BillingPaymentStatus) : null);
    },
    (error) => onError?.(error)
  );
}
