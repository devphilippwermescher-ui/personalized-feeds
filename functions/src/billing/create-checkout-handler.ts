import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { hasCurrentProAccess } from './access-policy.js';
import { BillingRateLimitError, enforceCheckoutRateLimit } from './checkout-rate-limit.js';
import {
  BillingCheckoutInProgressError,
  completeCheckoutSession,
  createCheckoutSession,
  deleteCheckoutSession,
} from './checkout-session-repository.js';
import { getBillingConfiguration, isBillingCurrency, isBillingInterval } from './config.js';
import { createCheckout, isTransientLemonSqueezyError } from './lemon-squeezy-api.js';

interface BillingCheckoutRequest {
  auth?: {
    uid: string;
    token: Record<string, unknown>;
  };
  data?: unknown;
}

interface BillingCheckoutLogger {
  info(message: string, context: Record<string, unknown>): void;
  warn(message: string, context: Record<string, unknown>): void;
  error(message: string, context: Record<string, unknown>): void;
}

export async function handleCreateBillingCheckout(params: {
  request: BillingCheckoutRequest;
  db: Firestore;
  apiKey: string;
  logger: BillingCheckoutLogger;
}): Promise<{ url: string }> {
  const { request, db } = params;
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to upgrade your plan.');
  }
  const requestData = request.data && typeof request.data === 'object' ? request.data : {};
  const interval = 'interval' in requestData ? requestData.interval : undefined;
  if (!isBillingInterval(interval)) {
    throw new HttpsError('invalid-argument', 'Choose Monthly or Annual billing.');
  }
  const currency = 'currency' in requestData ? requestData.currency : undefined;
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

  const existingSubscription = await db.doc(`users/${request.auth.uid}/billing/subscription`).get();
  if (hasCurrentProAccess(existingSubscription.data())) {
    throw new HttpsError('already-exists', 'Your Pro subscription is already active.');
  }

  const startedAt = Date.now();
  let checkoutSessionId: string | null = null;
  let providerCheckoutCreated = false;

  try {
    await enforceCheckoutRateLimit({
      db,
      scope: 'firebase-user',
      fingerprint: request.auth.uid,
    });
    const checkoutSession = await createCheckoutSession({
      db,
      userId: request.auth.uid,
      configuration: storeConfiguration,
      interval,
      testMode: billingConfiguration.testMode,
    });
    checkoutSessionId = checkoutSession.sessionId;
    if (checkoutSession.state === 'ready') {
      return { url: checkoutSession.checkoutUrl };
    }
    const email = typeof request.auth.token.email === 'string' ? request.auth.token.email : undefined;
    const url = await createCheckout({
      apiKey: params.apiKey,
      configuration: storeConfiguration,
      interval,
      checkoutSessionId,
      expiresAt: checkoutSession.session.checkoutExpiresAt,
      email,
      testMode: billingConfiguration.testMode,
      redirectUrl: billingConfiguration.checkoutSuccessUrl,
    });
    providerCheckoutCreated = true;
    await completeCheckoutSession({
      db,
      userId: request.auth.uid,
      sessionId: checkoutSessionId,
      checkoutUrl: url,
    });
    params.logger.info('Created Lemon Squeezy checkout', {
      currency,
      interval,
      durationMs: Date.now() - startedAt,
    });
    return { url };
  } catch (error) {
    if (checkoutSessionId && !providerCheckoutCreated) {
      await deleteCheckoutSession(db, checkoutSessionId, request.auth.uid).catch((cleanupError) => {
        params.logger.warn('Failed to remove an unused billing checkout session', { cleanupError });
      });
    }
    if (error instanceof BillingCheckoutInProgressError) {
      const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      const message =
        error.state === 'ready'
          ? `A ${error.currency} checkout is already open. To switch, try again in ${minutes} min.`
          : `A ${error.currency} checkout is opening. Please wait a moment.`;
      throw new HttpsError('already-exists', message, {
        code: 'CHECKOUT_IN_PROGRESS',
        state: error.state,
        currency: error.currency,
        interval: error.interval,
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    if (error instanceof BillingRateLimitError) {
      throw new HttpsError('resource-exhausted', 'Too many checkout attempts. Please wait and try again.');
    }
    if (isTransientLemonSqueezyError(error)) {
      throw new HttpsError('unavailable', 'Checkout is temporarily unavailable. Please try again.');
    }
    params.logger.error('Failed to create Lemon Squeezy checkout', {
      currency,
      interval,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw new HttpsError('internal', 'Unable to open checkout right now. Please try again.');
  }
}
