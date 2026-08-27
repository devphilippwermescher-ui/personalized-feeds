import { getDoc } from 'firebase/firestore';
import type { BillingSubscription } from '../plans';
import { subscriptionDoc } from './refs';

export async function getBillingSubscription(userId: string): Promise<BillingSubscription | null> {
  const snapshot = await getDoc(subscriptionDoc(userId));
  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as BillingSubscription;
}
