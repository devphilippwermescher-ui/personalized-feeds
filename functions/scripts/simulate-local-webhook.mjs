import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const functionsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readEnvironmentFile(fileName) {
  const content = await readFile(resolve(functionsDirectory, fileName), 'utf8');
  return Object.fromEntries(
    content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        const key = line.slice(0, separatorIndex).trim();
        const rawValue = line.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^(['"])(.*)\1$/u, '$2');
        return [key, value];
      })
  );
}

function getArgument(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

const uid = requireValue(getArgument('uid'), 'Pass the local Firebase user ID with --uid=<uid>.');
const interval = getArgument('interval', 'annual');
if (interval !== 'monthly' && interval !== 'annual') {
  throw new Error('--interval must be monthly or annual.');
}

const [configuration, secrets] = await Promise.all([
  readEnvironmentFile('.env.local'),
  readEnvironmentFile('.secret.local'),
]);
const storeId = Number(
  requireValue(
    configuration.LEMON_SQUEEZY_USD_STORE_ID || configuration.LEMON_SQUEEZY_STORE_ID,
    'Set LEMON_SQUEEZY_USD_STORE_ID in functions/.env.local.'
  )
);
const variantId = Number(
  requireValue(
    interval === 'annual'
      ? configuration.LEMON_SQUEEZY_USD_ANNUAL_VARIANT_ID || configuration.LEMON_SQUEEZY_ANNUAL_VARIANT_ID
      : configuration.LEMON_SQUEEZY_USD_MONTHLY_VARIANT_ID || configuration.LEMON_SQUEEZY_MONTHLY_VARIANT_ID,
    `Set the ${interval} variant ID in functions/.env.local.`
  )
);
const webhookSecret = requireValue(
  secrets.LEMON_SQUEEZY_WEBHOOK_SECRET,
  'Set LEMON_SQUEEZY_WEBHOOK_SECRET in functions/.secret.local.'
);
if (!Number.isInteger(storeId) || !Number.isInteger(variantId)) {
  throw new Error('Store ID and variant ID must be integers.');
}

const now = new Date();
const renewsAt = new Date(now);
if (interval === 'annual') renewsAt.setUTCFullYear(renewsAt.getUTCFullYear() + 1);
else renewsAt.setUTCMonth(renewsAt.getUTCMonth() + 1);
const checkoutSessionId = randomUUID();
const checkoutExpiresAt = now.getTime() + 30 * 60 * 1000;
const checkoutSessionExpiresAt = checkoutExpiresAt + 5 * 60 * 1000;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const projectId = getArgument('project', 'myfeedpilot-dev');
const checkoutSessionUrl =
  `http://${firestoreHost}/v1/projects/${encodeURIComponent(projectId)}` +
  `/databases/(default)/documents/billingCheckoutSessions/${encodeURIComponent(checkoutSessionId)}`;
const checkoutSessionResponse = await fetch(checkoutSessionUrl, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    fields: {
      userId: { stringValue: uid },
      storeId: { stringValue: String(storeId) },
      variantId: { stringValue: String(variantId) },
      currency: { stringValue: 'USD' },
      interval: { stringValue: interval },
      testMode: { booleanValue: true },
      createdAt: { integerValue: String(now.getTime()) },
      checkoutExpiresAt: { integerValue: String(checkoutExpiresAt) },
      expiresAt: { integerValue: String(checkoutSessionExpiresAt) },
      deleteAt: { timestampValue: new Date(checkoutSessionExpiresAt).toISOString() },
    },
  }),
});
if (!checkoutSessionResponse.ok) {
  throw new Error(
    `Could not seed the local checkout session (${checkoutSessionResponse.status}): ` +
      (await checkoutSessionResponse.text())
  );
}

const payload = JSON.stringify({
  meta: {
    event_name: 'subscription_created',
    custom_data: {
      checkout_session_id: checkoutSessionId,
    },
  },
  data: {
    type: 'subscriptions',
    id: `local-demo-${uid}`,
    attributes: {
      store_id: storeId,
      customer_id: 1,
      variant_id: variantId,
      status: 'active',
      cancelled: false,
      renews_at: renewsAt.toISOString(),
      ends_at: null,
      updated_at: now.toISOString(),
      test_mode: true,
    },
  },
});
const signature = createHmac('sha256', webhookSecret).update(payload).digest('hex');
const endpoint =
  process.env.LOCAL_BILLING_WEBHOOK_URL || 'http://127.0.0.1:5001/myfeedpilot-dev/us-central1/lemonSqueezyWebhook';
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-event-name': 'subscription_created',
    'x-signature': signature,
  },
  body: payload,
});
const responseBody = await response.text();
if (!response.ok) {
  throw new Error(`Local webhook returned ${response.status}: ${responseBody}`);
}

console.log(`Simulated ${interval} subscription for ${uid} through an opaque checkout session: ${responseBody}`);
