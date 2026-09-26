import { z } from 'zod';
import type {
  LemonSqueezySubscriptionInvoiceWebhook,
  LemonSqueezySubscriptionWebhook,
  LemonSqueezyWebhookEnvelope,
} from './types.js';

const customDataSchema = z.record(z.unknown());
const providerDateSchema = z.string().datetime({ offset: true });
const subscriptionStatusSchema = z.enum(['on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired']);

const webhookEnvelopeSchema = z.object({
  meta: z.object({
    event_name: z.string().min(1),
    custom_data: customDataSchema.optional(),
  }),
  data: z.object({
    type: z.string().min(1),
    id: z.string().min(1),
    attributes: z.unknown(),
  }),
});

const subscriptionWebhookSchema = webhookEnvelopeSchema.extend({
  data: z.object({
    type: z.literal('subscriptions'),
    id: z.string().min(1),
    attributes: z.object({
      store_id: z.number().int().positive(),
      customer_id: z.number().int().positive(),
      variant_id: z.number().int().positive(),
      user_email: z.string().email().max(320),
      status: subscriptionStatusSchema,
      cancelled: z.boolean(),
      renews_at: providerDateSchema.nullable(),
      ends_at: providerDateSchema.nullable(),
      updated_at: providerDateSchema,
      test_mode: z.boolean(),
    }),
  }),
});

const subscriptionInvoiceWebhookSchema = webhookEnvelopeSchema.extend({
  meta: z.object({
    event_name: z.enum([
      'subscription_payment_failed',
      'subscription_payment_success',
      'subscription_payment_recovered',
    ]),
  }),
  data: z.object({
    type: z.literal('subscription-invoices'),
    id: z.string().min(1),
    attributes: z.object({
      store_id: z.number().int().positive(),
      subscription_id: z.number().int().positive(),
      customer_id: z.number().int().positive(),
      user_email: z.string().email().max(320),
      billing_reason: z.string().min(1),
      status: z.enum(['pending', 'paid', 'void', 'refunded', 'partial_refund']),
      updated_at: providerDateSchema,
      test_mode: z.boolean(),
    }),
  }),
});

export function parseWebhookEnvelope(payload: unknown): LemonSqueezyWebhookEnvelope {
  return webhookEnvelopeSchema.parse(payload) as LemonSqueezyWebhookEnvelope;
}

export function parseSubscriptionWebhookPayload(payload: unknown): LemonSqueezySubscriptionWebhook {
  return subscriptionWebhookSchema.parse(payload) as LemonSqueezySubscriptionWebhook;
}

export function parseSubscriptionInvoiceWebhookPayload(payload: unknown): LemonSqueezySubscriptionInvoiceWebhook {
  return subscriptionInvoiceWebhookSchema.parse(payload) as LemonSqueezySubscriptionInvoiceWebhook;
}

export function formatWebhookValidationError(error: unknown): string[] {
  if (!(error instanceof z.ZodError)) return ['unknown validation failure'];
  return error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`);
}

export function isWebhookValidationError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError;
}
