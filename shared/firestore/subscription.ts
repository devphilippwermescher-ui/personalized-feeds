import { getDoc, onSnapshot } from 'firebase/firestore';
import type { BillingSubscription } from '../plans';
import { subscriptionDoc } from './refs';

export async function getBillingSubscription(userId: string): Promise<BillingSubscription | null> {
  const snapshot = await getDoc(subscriptionDoc(userId));
  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as BillingSubscription;
}

export function subscribeBillingSubscription(
  userId: string,
  onSubscription: (subscription: BillingSubscription | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    subscriptionDoc(userId),
    (snapshot) => {
      onSubscription(snapshot.exists() ? (snapshot.data() as BillingSubscription) : null);
    },
    (error) => onError?.(error)
  );
}
