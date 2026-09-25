import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { createCheckoutSession, deleteCheckoutSession } from './billing/checkout-session-repository.js';
import { getBillingConfiguration, isBillingCurrency, isBillingInterval } from './billing/config.js';
import { normalizeBillingEmail } from './billing/email-identity.js';
import { hasCurrentProAccess } from './billing/access-policy.js';
import { claimPendingSubscriptions, saveSubscription } from './billing/firestore-subscription-repository.js';
import { createBillingHandoff as createBillingHandoffRecord } from './billing/handoff-repository.js';
import { createCheckout, getCustomerPortalUrl } from './billing/lemon-squeezy-api.js';
import { isSubscriptionEvent, parseSubscriptionWebhook } from './billing/subscription-state.js';
import { verifyWebhookSignature } from './billing/webhook-security.js';
import {
  formatWebhookValidationError,
  isWebhookValidationError,
  parseSubscriptionWebhookPayload,
  parseWebhookEnvelope,
} from './billing/webhook-schema.js';
import { createWebsiteCheckoutHttpHandler } from './billing/website-checkout.js';

export {
  acceptSharedFeedNotification,
  cleanupDeletedFeedShares,
  followSharedFeedLink,
  getFeedPlanPolicies,
  removeSharedFeedAccess,
  shareFeedWithEmail,
  unfollowSharedFeed,
} from './sharing/callables.js';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const lemonSqueezyApiKey = defineSecret('LEMON_SQUEEZY_API_KEY');
const lemonSqueezyWebhookSecret = defineSecret('LEMON_SQUEEZY_WEBHOOK_SECRET');

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
    const currency = request.data?.currency;
    if (!isBillingCurrency(currency)) {
      throw new HttpsError('invalid-argument', 'Choose EUR or USD billing.');
    }

    const billingConfiguration = getBillingConfiguration();
    const storeConfiguration = billingConfiguration.stores[currency];
    if (!storeConfiguration) {
      throw new HttpsError(
        'failed-precondition',
        `${currency} checkout is not available yet. Select USD in Profile & billing to continue.`
      );
    }

    const db = getFirestore();
    const existingSubscription = await db.doc(`users/${request.auth.uid}/billing/subscription`).get();
    if (hasCurrentProAccess(existingSubscription.data())) {
      throw new HttpsError('already-exists', 'Your Pro subscription is already active.');
    }

    const startedAt = Date.now();
    let checkoutSessionId: string | null = null;

    try {
      const checkoutSession = await createCheckoutSession({
        db,
        userId: request.auth.uid,
        configuration: storeConfiguration,
        interval,
        testMode: billingConfiguration.testMode,
      });
      checkoutSessionId = checkoutSession.sessionId;
      const url = await createCheckout({
        apiKey: lemonSqueezyApiKey.value(),
        configuration: storeConfiguration,
        interval,
        checkoutSessionId,
        expiresAt: checkoutSession.session.checkoutExpiresAt,
        email: request.auth.token.email,
        testMode: billingConfiguration.testMode,
        redirectUrl: billingConfiguration.checkoutSuccessUrl,
      });
      logger.info('Created Lemon Squeezy checkout', {
        currency,
        interval,
        durationMs: Date.now() - startedAt,
      });
      return { url };
    } catch (error) {
      if (checkoutSessionId) {
        await deleteCheckoutSession(db, checkoutSessionId).catch((cleanupError) => {
          logger.warn('Failed to remove an unused billing checkout session', { cleanupError });
        });
      }
      logger.error('Failed to create Lemon Squeezy checkout', {
        currency,
        interval,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw new HttpsError('internal', 'Unable to open checkout right now. Please try again.');
    }
  }
);

export const createBillingHandoff = onCall(async (request): Promise<{ token: string; expiresAt: number }> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to view subscription plans.');
  }
  try {
    return await createBillingHandoffRecord({
      db: getFirestore(),
      userId: request.auth.uid,
      email: normalizeBillingEmail(request.auth.token.email) ?? undefined,
    });
  } catch (error) {
    logger.error('Failed to create a billing handoff', { error });
    throw new HttpsError('internal', 'Unable to open pricing right now.');
  }
});

export const claimGuestBillingSubscription = onCall(
  async (request): Promise<{ claimedCount: number; verificationRequired: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to claim your subscription.');
    }
    const normalizedEmail = normalizeBillingEmail(request.auth.token.email);
    if (!normalizedEmail) {
      throw new HttpsError('failed-precondition', 'Your account does not have a valid email address.');
    }
    if (request.auth.token.email_verified !== true) {
      return { claimedCount: 0, verificationRequired: true };
    }
    try {
      const claimedCount = await claimPendingSubscriptions({
        db: getFirestore(),
        userId: request.auth.uid,
        normalizedEmail,
      });
      if (claimedCount > 0) {
        logger.info('Claimed guest billing subscriptions', { claimedCount });
      }
      return { claimedCount, verificationRequired: false };
    } catch (error) {
      logger.error('Failed to claim guest billing subscriptions', { error });
      throw new HttpsError('internal', 'Unable to check for an existing subscription right now.');
    }
  }
);

export const createWebsiteCheckout = onRequest(
  { secrets: [lemonSqueezyApiKey] },
  createWebsiteCheckoutHttpHandler({
    db: getFirestore(),
    getApiKey: () => lemonSqueezyApiKey.value(),
    logError: (message, context) => logger.error(message, context),
  })
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

  const contentType = request.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    response.status(415).send('Content-Type must be application/json');
    return;
  }

  const signature = request.header('x-signature');
  if (!signature || !verifyWebhookSignature(request.rawBody, signature, lemonSqueezyWebhookSecret.value())) {
    response.status(401).send('Invalid signature');
    return;
  }

  let envelope;
  try {
    envelope = parseWebhookEnvelope(request.body);
  } catch (error) {
    logger.warn('Rejected an invalid Lemon Squeezy webhook envelope', {
      validationErrors: formatWebhookValidationError(error),
    });
    response.status(400).send('Invalid webhook payload');
    return;
  }

  const eventName = envelope.meta.event_name;
  if (request.header('x-event-name') !== eventName) {
    response.status(400).send('Webhook event header does not match the payload');
    return;
  }
  if (!eventName || !isSubscriptionEvent(eventName)) {
    response.status(200).json({ received: true, processed: false });
    return;
  }

  try {
    const payload = parseSubscriptionWebhookPayload(request.body);
    const parsed = parseSubscriptionWebhook(payload, getBillingConfiguration());
    const result = await saveSubscription({
      db: getFirestore(),
      checkoutSessionId: parsed.checkoutSessionId,
      customerEmail: parsed.customerEmail,
      subscription: parsed.subscription,
    });
    if (result === 'missing_user') {
      logger.error('Subscription webhook could not be linked to a Firebase user', {
        subscriptionId: parsed.subscription.subscriptionId,
        eventName,
      });
      response.status(500).send('Subscription identity could not be resolved');
      return;
    }
    response.status(200).json({
      received: true,
      processed: result === 'updated' || result === 'pending_claim',
      result,
    });
  } catch (error) {
    if (isWebhookValidationError(error)) {
      logger.warn('Rejected an invalid Lemon Squeezy subscription webhook', {
        eventName,
        validationErrors: formatWebhookValidationError(error),
      });
      response.status(400).send('Invalid subscription webhook payload');
      return;
    }
    logger.error('Failed to process Lemon Squeezy webhook', { eventName, error });
    response.status(500).send('Webhook processing failed');
  }
});
