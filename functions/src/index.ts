import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { getBillingConfiguration, isBillingInterval } from './billing/config.js';
import { saveSubscription } from './billing/firestore-subscription-repository.js';
import { createCheckout, getCustomerPortalUrl } from './billing/lemon-squeezy-api.js';
import { isSubscriptionEvent, parseSubscriptionWebhook } from './billing/subscription-state.js';
import type { LemonSqueezySubscriptionWebhook } from './billing/types.js';
import { verifyWebhookSignature } from './billing/webhook-security.js';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const lemonSqueezyApiKey = defineSecret('LEMON_SQUEEZY_API_KEY');
const lemonSqueezyWebhookSecret = defineSecret('LEMON_SQUEEZY_WEBHOOK_SECRET');

function hasCurrentProAccess(data: FirebaseFirestore.DocumentData | undefined, now = Date.now()): boolean {
  if (data?.plan !== 'pro') return false;
  if (data.status === 'active') return true;
  const paidUntil = typeof data.endsAt === 'number' ? data.endsAt : data.currentPeriodEnd;
  return data.status === 'cancelled' && typeof paidUntil === 'number' && paidUntil > now;
}

export const createBillingCheckout = onCall(
  { secrets: [lemonSqueezyApiKey] },
  async (request): Promise<{ url: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to upgrade your plan.');
    }
    const interval = request.data?.interval;
    if (!isBillingInterval(interval)) {
      throw new HttpsError('invalid-argument', 'Choose Monthly or Annual billing.');
    }

    const existingSubscription = await getFirestore().doc(`users/${request.auth.uid}/billing/subscription`).get();
    if (hasCurrentProAccess(existingSubscription.data())) {
      throw new HttpsError('already-exists', 'Your Pro subscription is already active.');
    }

    try {
      const url = await createCheckout({
        apiKey: lemonSqueezyApiKey.value(),
        configuration: getBillingConfiguration(),
        interval,
        userId: request.auth.uid,
        email: request.auth.token.email,
      });
      return { url };
    } catch (error) {
      logger.error('Failed to create Lemon Squeezy checkout', error);
      throw new HttpsError('internal', 'Unable to open checkout right now.');
    }
  }
);

export const getBillingPortal = onCall({ secrets: [lemonSqueezyApiKey] }, async (request): Promise<{ url: string }> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to manage your subscription.');
  }

  const snapshot = await getFirestore().doc(`users/${request.auth.uid}/billing/subscription`).get();
  const subscriptionId = snapshot.get('subscriptionId');
  if (!snapshot.exists || typeof subscriptionId !== 'string' || !subscriptionId) {
    throw new HttpsError('failed-precondition', 'No Lemon Squeezy subscription was found.');
  }

  try {
    const url = await getCustomerPortalUrl(lemonSqueezyApiKey.value(), subscriptionId);
    return { url };
  } catch (error) {
    logger.error('Failed to retrieve Lemon Squeezy customer portal', error);
    throw new HttpsError('internal', 'Unable to open billing management right now.');
  }
});

export const lemonSqueezyWebhook = onRequest({ secrets: [lemonSqueezyWebhookSecret] }, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).send('Method Not Allowed');
    return;
  }

  const signature = request.header('x-signature');
  if (!signature || !verifyWebhookSignature(request.rawBody, signature, lemonSqueezyWebhookSecret.value())) {
    response.status(401).send('Invalid signature');
    return;
  }

  const payload = request.body as LemonSqueezySubscriptionWebhook;
  const eventName = payload?.meta?.event_name;
  if (!eventName || !isSubscriptionEvent(eventName)) {
    response.status(200).json({ received: true, processed: false });
    return;
  }

  try {
    const parsed = parseSubscriptionWebhook(payload, getBillingConfiguration());
    const result = await saveSubscription({
      db: getFirestore(),
      customUserId: parsed.userId,
      subscription: parsed.subscription,
    });
    if (result === 'missing_user') {
      logger.error('Subscription webhook could not be linked to a Firebase user', {
        subscriptionId: parsed.subscription.subscriptionId,
        eventName,
      });
    }
    response.status(200).json({ received: true, processed: result === 'updated', result });
  } catch (error) {
    logger.error('Failed to process Lemon Squeezy webhook', { eventName, error });
    response.status(500).send('Webhook processing failed');
  }
});
