import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { handleCreateBillingCheckout } from './billing/create-checkout-handler.js';
import { handleGetBillingPortal } from './billing/customer-portal-handler.js';
import { getBillingConfiguration } from './billing/config.js';
import { normalizeBillingEmail } from './billing/email-identity.js';
import {
  claimPendingSubscriptions,
  hasPendingSubscriptions,
  reconcileUserSubscriptionEntitlement,
  saveSubscription,
} from './billing/firestore-subscription-repository.js';
import { createBillingHandoff as createBillingHandoffRecord } from './billing/handoff-repository.js';
import { isSubscriptionPaymentEvent, parseSubscriptionPaymentWebhook } from './billing/payment-event-state.js';
import { savePaymentStatus } from './billing/payment-status-repository.js';
import { isSubscriptionEvent, parseSubscriptionWebhook } from './billing/subscription-state.js';
import { verifyWebhookSignature } from './billing/webhook-security.js';
import {
  formatWebhookValidationError,
  isWebhookValidationError,
  parseSubscriptionInvoiceWebhookPayload,
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
  async (request): Promise<{ url: string }> =>
    handleCreateBillingCheckout({
      request,
      db: getFirestore(),
      apiKey: lemonSqueezyApiKey.value(),
      logger,
    })
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
    try {
      if (request.auth.token.email_verified !== true) {
        const verificationRequired = await hasPendingSubscriptions({
          db: getFirestore(),
          normalizedEmail,
        });
        return { claimedCount: 0, verificationRequired };
      }
      const claimedCount = await claimPendingSubscriptions({
        db: getFirestore(),
        userId: request.auth.uid,
        normalizedEmail,
      });
      await reconcileUserSubscriptionEntitlement({
        db: getFirestore(),
        userId: request.auth.uid,
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

export const getBillingPortal = onCall(
  { secrets: [lemonSqueezyApiKey] },
  async (request): Promise<{ url: string }> =>
    handleGetBillingPortal({
      request,
      db: getFirestore(),
      apiKey: lemonSqueezyApiKey.value(),
      logError: (message, error) => logger.error(message, error),
    })
);

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
  if (!eventName || (!isSubscriptionEvent(eventName) && !isSubscriptionPaymentEvent(eventName))) {
    response.status(200).json({ received: true, processed: false });
    return;
  }

  try {
    if (isSubscriptionPaymentEvent(eventName)) {
      const payload = parseSubscriptionInvoiceWebhookPayload(request.body);
      const paymentStatus = parseSubscriptionPaymentWebhook(payload, getBillingConfiguration());
      const result = await savePaymentStatus({ db: getFirestore(), paymentStatus });
      if (result === 'missing_user' || result === 'missing_subscription') {
        logger.error('Payment webhook could not be linked to a Firebase subscription', {
          subscriptionId: paymentStatus.subscriptionId,
          invoiceId: paymentStatus.invoiceId,
          eventName,
          result,
        });
        response.status(500).send('Payment identity could not be resolved');
        return;
      }
      response.status(200).json({
        received: true,
        processed: result === 'updated',
        result,
      });
      return;
    }

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
      logger.warn('Rejected an invalid Lemon Squeezy billing webhook', {
        eventName,
        validationErrors: formatWebhookValidationError(error),
      });
      response.status(400).send('Invalid billing webhook payload');
      return;
    }
    logger.error('Failed to process Lemon Squeezy webhook', { eventName, error });
    response.status(500).send('Webhook processing failed');
  }
});
