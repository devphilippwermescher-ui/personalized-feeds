import type { Firestore } from 'firebase-admin/firestore';
import { hasCurrentProAccess } from './access-policy.js';
import {
  createCheckoutSession,
  createGuestCheckoutSession,
  deleteCheckoutSession,
} from './checkout-session-repository.js';
import { getBillingConfiguration, isBillingCurrency, isBillingInterval } from './config.js';
import { BillingRateLimitError, enforceWebsiteCheckoutRateLimit } from './checkout-rate-limit.js';
import {
  BillingHandoffError,
  completeBillingHandoff,
  releaseBillingHandoff,
  reserveBillingHandoff,
} from './handoff-repository.js';
import { createCheckout } from './lemon-squeezy-api.js';

const HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const WEBSITE_ORIGIN_PATTERNS = [
  /^https:\/\/(?:www\.)?myfeedpilot\.com$/,
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/,
];

interface WebsiteCheckoutRequest {
  currency: 'EUR' | 'USD';
  interval: 'monthly' | 'annual';
  handoffToken?: string;
}

interface HttpRequestLike {
  method: string;
  body: unknown;
  ip?: string;
  header(name: string): string | undefined;
}

interface HttpResponseLike {
  setHeader(name: string, value: string): void;
  status(code: number): HttpResponseLike;
  json(value: unknown): void;
  send(value?: unknown): void;
}

export class WebsiteCheckoutError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly publicMessage: string
  ) {
    super(code);
    this.name = 'WebsiteCheckoutError';
  }
}

export function parseWebsiteCheckoutRequest(value: unknown): WebsiteCheckoutRequest {
  if (!value || typeof value !== 'object') {
    throw new WebsiteCheckoutError(400, 'INVALID_REQUEST', 'Choose a currency and billing period.');
  }
  const candidate = value as { currency?: unknown; interval?: unknown; handoffToken?: unknown };
  if (!isBillingCurrency(candidate.currency) || !isBillingInterval(candidate.interval)) {
    throw new WebsiteCheckoutError(400, 'INVALID_REQUEST', 'Choose a currency and billing period.');
  }
  if (candidate.handoffToken !== undefined) {
    if (typeof candidate.handoffToken !== 'string' || !HANDOFF_TOKEN_PATTERN.test(candidate.handoffToken)) {
      throw new WebsiteCheckoutError(401, 'HANDOFF_INVALID', 'This extension checkout link has expired.');
    }
  }
  return {
    currency: candidate.currency,
    interval: candidate.interval,
    ...(typeof candidate.handoffToken === 'string' ? { handoffToken: candidate.handoffToken } : {}),
  };
}

export function isAllowedWebsiteOrigin(origin: string): boolean {
  return WEBSITE_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function setCorsHeaders(request: HttpRequestLike, response: HttpResponseLike): boolean {
  const origin = request.header('origin');
  if (origin && !isAllowedWebsiteOrigin(origin)) return false;
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Max-Age', '3600');
  return true;
}

export async function createWebsiteCheckout(params: {
  db: Firestore;
  apiKey: string;
  request: WebsiteCheckoutRequest;
}): Promise<{ url: string }> {
  const configuration = getBillingConfiguration();
  const storeConfiguration = configuration.stores[params.request.currency];
  if (!storeConfiguration) {
    throw new WebsiteCheckoutError(503, 'CURRENCY_UNAVAILABLE', 'This currency is not available right now.');
  }

  let reservation: { reservationId: string; userId: string; email?: string } | null = null;
  let checkoutSessionId: string | null = null;
  try {
    if (params.request.handoffToken) {
      try {
        reservation = await reserveBillingHandoff({ db: params.db, token: params.request.handoffToken });
      } catch (error) {
        if (error instanceof BillingHandoffError) {
          throw new WebsiteCheckoutError(
            error.code === 'HANDOFF_EXPIRED' ? 410 : 401,
            error.code,
            'This extension checkout link has expired.'
          );
        }
        throw error;
      }
      const existingSubscription = await params.db.doc(`users/${reservation.userId}/billing/subscription`).get();
      if (hasCurrentProAccess(existingSubscription.data())) {
        throw new WebsiteCheckoutError(409, 'ALREADY_PRO', 'Your Pro subscription is already active.');
      }
      const checkoutSession = await createCheckoutSession({
        db: params.db,
        userId: reservation.userId,
        configuration: storeConfiguration,
        interval: params.request.interval,
        testMode: configuration.testMode,
      });
      checkoutSessionId = checkoutSession.sessionId;
      const url = await createCheckout({
        apiKey: params.apiKey,
        configuration: storeConfiguration,
        interval: params.request.interval,
        checkoutSessionId,
        expiresAt: checkoutSession.session.checkoutExpiresAt,
        email: reservation.email,
        testMode: configuration.testMode,
        redirectUrl: configuration.checkoutSuccessUrl,
      });
      await completeBillingHandoff({
        db: params.db,
        token: params.request.handoffToken,
        reservationId: reservation.reservationId,
        checkoutSessionId,
      });
      return { url };
    }

    const checkoutSession = await createGuestCheckoutSession({
      db: params.db,
      configuration: storeConfiguration,
      interval: params.request.interval,
      testMode: configuration.testMode,
    });
    checkoutSessionId = checkoutSession.sessionId;
    const url = await createCheckout({
      apiKey: params.apiKey,
      configuration: storeConfiguration,
      interval: params.request.interval,
      checkoutSessionId,
      expiresAt: checkoutSession.session.checkoutExpiresAt,
      testMode: configuration.testMode,
      redirectUrl: configuration.checkoutSuccessUrl,
    });
    return { url };
  } catch (error) {
    if (checkoutSessionId) {
      await deleteCheckoutSession(params.db, checkoutSessionId).catch(() => undefined);
    }
    if (reservation && params.request.handoffToken) {
      await releaseBillingHandoff({
        db: params.db,
        token: params.request.handoffToken,
        reservationId: reservation.reservationId,
      }).catch(() => undefined);
    }
    throw error;
  }
}

export function createWebsiteCheckoutHttpHandler(params: {
  db: Firestore;
  getApiKey: () => string;
  logError: (message: string, context?: Record<string, unknown>) => void;
}) {
  return async (request: HttpRequestLike, response: HttpResponseLike): Promise<void> => {
    if (!setCorsHeaders(request, response)) {
      response.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed.' } });
      return;
    }
    if (request.method === 'OPTIONS') {
      response.status(204).send();
      return;
    }
    if (request.method !== 'POST') {
      response.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });
      return;
    }
    const contentType = request.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      response.status(415).json({ error: { code: 'INVALID_CONTENT_TYPE', message: 'Use application/json.' } });
      return;
    }

    try {
      await enforceWebsiteCheckoutRateLimit({
        db: params.db,
        fingerprint: request.ip || 'unknown',
      });
      const input = parseWebsiteCheckoutRequest(request.body);
      const result = await createWebsiteCheckout({ db: params.db, apiKey: params.getApiKey(), request: input });
      response.status(200).json(result);
    } catch (error) {
      if (error instanceof BillingRateLimitError) {
        response.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Please wait and try again.' } });
        return;
      }
      if (error instanceof WebsiteCheckoutError) {
        response.status(error.status).json({ error: { code: error.code, message: error.publicMessage } });
        return;
      }
      params.logError('Website checkout failed', { error });
      response.status(500).json({
        error: { code: 'CHECKOUT_UNAVAILABLE', message: 'We couldn’t open checkout. Please try again.' },
      });
    }
  };
}
