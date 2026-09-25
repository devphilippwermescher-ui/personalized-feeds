# myFeedPilot billing functions

Firebase Functions owns all trusted Lemon Squeezy operations. The extension never receives the API key or webhook signing secret and cannot write its own billing document.

## Local demo without Blaze

The Firebase Emulator Suite can run Auth, Firestore and Functions locally. Only the dedicated billing-local extension build connects to these emulators; normal development and production builds continue using their configured Firebase projects.

### Prerequisites

- Node.js 20
- Java 21 for the Firestore emulator
- the root dependencies installed with `npm install`

Create local configuration files:

```bash
cp functions/.env.example functions/.env.local
cp functions/.secret.local.example functions/.secret.local
```

Fill `functions/.env.local` with the USD Test mode Store ID and its two Variant IDs. Leave the EUR values empty until that store is ready:

```dotenv
LEMON_SQUEEZY_USD_STORE_ID=your_usd_test_store_id
LEMON_SQUEEZY_USD_MONTHLY_VARIANT_ID=your_usd_monthly_test_variant_id
LEMON_SQUEEZY_USD_ANNUAL_VARIANT_ID=your_usd_annual_test_variant_id

LEMON_SQUEEZY_EUR_STORE_ID=
LEMON_SQUEEZY_EUR_MONTHLY_VARIANT_ID=
LEMON_SQUEEZY_EUR_ANNUAL_VARIANT_ID=

LEMON_SQUEEZY_TEST_MODE=true
BILLING_CHECKOUT_SUCCESS_URL=https://myfeedpilot.com/checkout/success
```

The pricing website sends the selected currency and billing interval to the public `createWebsiteCheckout` Function. USD checkout works with the required configuration above. If EUR is selected before all EUR identifiers exist, checkout is blocked with a clear message instead of silently opening a USD checkout.

Fill `functions/.secret.local`:

```dotenv
LEMON_SQUEEZY_API_KEY=your_test_mode_api_key
LEMON_SQUEEZY_WEBHOOK_SECRET=your_local_signing_secret
```

These two files are ignored by Git. Never commit or send their real values in chat.

Start the local backend in terminal 1:

```bash
npm run emulators:billing
```

The Emulator Suite UI is available at `http://127.0.0.1:4000`.

Build the extension in terminal 2:

```bash
npm run dev:billing-local
```

Load `extension/dist` as an unpacked extension and sign in. The local build accepts the normal Google credential but stores its Firebase session and application data only in the local Auth and Firestore emulators.

### Fast webhook demo

This path proves that opaque checkout-session binding, signature verification, runtime schema validation, webhook mapping, Firestore persistence and the extension's Pro entitlement UI work together without contacting Lemon Squeezy.

1. Find the signed-in user's UID in the Authentication tab at `http://127.0.0.1:4000`.
2. Keep the emulators and the billing-local extension build running.
3. Seed a short-lived opaque checkout session and send a correctly signed subscription event with one command:

```bash
npm run simulate:billing-webhook -- --uid=YOUR_LOCAL_UID --interval=annual
```

4. Verify the aggregate `users/{uid}/billing/subscription` and provider record `users/{uid}/billingSubscriptions/{subscriptionId}` in the local Firestore tab.
5. Reopen **Manage plan**. It should show the Annual Pro subscription.

### Website checkout flow

The extension no longer opens checkout directly from **Get Pro** or **Manage plan**. It requests a short-lived handoff from `createBillingHandoff` and opens:

```text
https://myfeedpilot.com/pricing#handoff=OPAQUE_TOKEN
```

The website removes the fragment from the address bar, keeps the token in memory, and posts the selected currency and interval to:

```text
https://us-central1-myfeedpilot-staging.cloudfunctions.net/createWebsiteCheckout
```

Authenticated handoffs bind the resulting checkout session to the Firebase UID and prefill the signed-in email. A visit without a handoff creates a guest checkout. Its webhook is kept as a pending claim keyed by a one-way email hash; `claimGuestBillingSubscription` moves it to the signed-in user only after Firebase reports that the same email is verified.

Handoff tokens are random, one-use, expire after ten minutes, and are stored only as SHA-256 hashes. The website endpoint accepts only the myFeedPilot website, Lovable preview origins, and localhost development origins. It rate-limits checkout creation per IP and never receives the Lemon Squeezy API key.

### Full Lemon Squeezy Test mode demo

For the real checkout, `LEMON_SQUEEZY_API_KEY` must be a Test mode API key. Lemon Squeezy API keys are user-scoped, so one Test mode key can access both stores owned by that account. Clicking **Get Pro** on the pricing website calls the HTTP Function, which selects the allowlisted Store/Variant and creates a random, short-lived server-owned checkout session. Only that opaque session ID is sent in Lemon Squeezy `custom_data`; the Firebase UID and handoff token never appear in an editable checkout URL.

The backend deliberately has no standard-link fallback. If the Lemon Squeezy checkout API is unavailable, checkout fails with a retryable user-facing error instead of opening a URL whose identity metadata can be edited. The Lemon Squeezy URL expires after 30 minutes; the server session allows a five-minute delivery grace so a payment completed immediately before expiry can still be linked. A completed session is deleted transactionally after the subscription ID is bound to its Firebase user. Abandoned sessions carry a `deleteAt` timestamp and should use a Firestore TTL policy in each deployed project.

Deploy `firestore.indexes.json` to enable TTL cleanup for `billingCheckoutSessions`, `billingHandoffs`, and `billingCheckoutRateLimits` on field `deleteAt`. TTL deletion is storage cleanup only: the backend always checks numeric expiry values, so expired records cannot be used while Firestore is waiting to delete them.

Lemon Squeezy needs a public HTTPS webhook URL. Run a temporary tunnel to local port `5001` with a tool such as Cloudflare Tunnel or ngrok. If the generated tunnel origin is `https://example.trycloudflare.com`, configure this Test mode webhook URL:

```text
https://example.trycloudflare.com/myfeedpilot-dev/us-central1/lemonSqueezyWebhook
```

Use the same signing secret as `functions/.secret.local` and enable:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`

Subscription pausing is not part of the myFeedPilot billing flow. Keep the Pause option disabled in the Lemon
Squeezy Customer Portal. An unexpected `paused` status received through `subscription_updated` fails closed to the
Free plan until the subscription becomes active again.

Then:

1. Open **Get Pro** or **Manage plan** in the extension and continue from the pricing website.
2. Select Monthly or Annual.
3. Complete checkout with a Lemon Squeezy Test mode card.
4. Verify the webhook response in Lemon Squeezy and the subscription document in local Firestore.
5. Return to LinkedIn. The modal polls Firestore and switches to the Pro view.

When the EUR store is ready, point its webhook to the same environment URL and configure it with the same environment-specific signing secret. The Function validates every incoming Store and Variant against the configured allowlist.

The copied public checkout links are useful for previewing Lemon Squeezy, but they do not replace the callable Function because they do not reliably attach the authenticated Firebase UID.

## Shared staging deployment

Deploying Functions requires the staging Firebase project to use the Blaze plan. The project owner should attach the team's billing account; a developer does not need to use a personal card.

Create `functions/.env.myfeedpilot-staging` with the same non-secret Test mode identifiers, then configure secrets interactively:

```bash
firebase functions:secrets:set LEMON_SQUEEZY_API_KEY --project staging
firebase functions:secrets:set LEMON_SQUEEZY_WEBHOOK_SECRET --project staging
```

Set `BILLING_CHECKOUT_SUCCESS_URL=https://myfeedpilot.com/checkout/success` in `functions/.env.myfeedpilot-staging`.

Build and deploy:

```bash
npm run type-check
npm run test:functions
npm run build:functions
firebase deploy --only functions,firestore:rules,firestore:indexes --project staging
```

The deploy must include the updated webhook plus these new Functions:

- `createBillingHandoff`
- `createWebsiteCheckout`
- `claimGuestBillingSubscription`

After deployment, configure the Test mode webhook URL:

```text
https://us-central1-myfeedpilot-staging.cloudfunctions.net/lemonSqueezyWebhook
```

Build the extension against deployed staging services with `APP_ENV=staging npm run build:extension`. Production builds target production unless `APP_ENV` is explicitly supplied.

Production must use live Store/Variant IDs, a Live mode API key and a production-only webhook secret. Test mode products and credentials must never be reused in production. Real `.env.*` files and `.secret.local` are ignored by Git; only templates and documentation are committed.
