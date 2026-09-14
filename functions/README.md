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
```

The extension sends the saved billing currency to the callable Function. USD checkout works with the required configuration above. If EUR is selected before all EUR identifiers exist, checkout is blocked with a clear message instead of silently opening a USD checkout.

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

This path proves that signature verification, webhook mapping, Firestore persistence and the extension's Pro entitlement UI work together without contacting Lemon Squeezy.

1. Find the signed-in user's UID in the Authentication tab at `http://127.0.0.1:4000`.
2. Keep the emulators and the billing-local extension build running.
3. Send a correctly signed subscription event:

```bash
npm run simulate:billing-webhook -- --uid=YOUR_LOCAL_UID --interval=annual
```

4. Verify `users/{uid}/billing/subscription` in the local Firestore tab.
5. Reopen **Manage plan**. It should show the Annual Pro subscription.

### Full Lemon Squeezy Test mode demo

For the real checkout, `LEMON_SQUEEZY_API_KEY` must be a Test mode API key. Lemon Squeezy API keys are user-scoped, so one Test mode key can access both stores owned by that account. Clicking the modal's checkout button calls the local callable Function, which selects the allowlisted Store/Variant for the requested currency and includes the Firebase UID, interval and currency in Lemon Squeezy `custom_data`.

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
- `subscription_paused`
- `subscription_unpaused`

Then:

1. Open **Manage plan** in the extension.
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

Build and deploy:

```bash
npm run type-check
npm run test:functions
npm run build:functions
firebase deploy --only functions --project staging
```

After deployment, configure the Test mode webhook URL:

```text
https://us-central1-myfeedpilot-staging.cloudfunctions.net/lemonSqueezyWebhook
```

Build the extension against deployed staging services with `APP_ENV=staging npm run build:extension`. Production builds target production unless `APP_ENV` is explicitly supplied.

Production must use live Store/Variant IDs, a Live mode API key and a production-only webhook secret. Test mode products and credentials must never be reused in production. Real `.env.*` files and `.secret.local` are ignored by Git; only templates and documentation are committed.
