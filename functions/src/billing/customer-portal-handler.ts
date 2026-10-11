import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { getCustomerPortalUrl, isTransientLemonSqueezyError } from './lemon-squeezy-api.js';

interface BillingPortalRequest {
  auth?: {
    uid: string;
  };
}

export async function handleGetBillingPortal(params: {
  request: BillingPortalRequest;
  db: Firestore;
  apiKey: string;
  logError: (message: string, error: unknown) => void;
}): Promise<{ url: string }> {
  if (!params.request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to manage your subscription.');
  }

  const snapshot = await params.db.doc(`users/${params.request.auth.uid}/billing/subscription`).get();
  const subscriptionId = snapshot.get('subscriptionId');
  if (!snapshot.exists || typeof subscriptionId !== 'string' || !subscriptionId) {
    throw new HttpsError('failed-precondition', 'No Lemon Squeezy subscription was found.');
  }

  try {
    const url = await getCustomerPortalUrl(params.apiKey, subscriptionId);
    return { url };
  } catch (error) {
    params.logError('Failed to retrieve Lemon Squeezy customer portal', error);
    if (isTransientLemonSqueezyError(error)) {
      throw new HttpsError('unavailable', 'Billing management is temporarily unavailable. Please try again.');
    }
    throw new HttpsError('internal', 'Unable to open billing management right now.');
  }
}
