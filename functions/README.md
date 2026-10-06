# myFeedPilot Firebase Functions

Firebase Functions owns both trusted Lemon Squeezy billing operations and shared-feed operations.
The extension never receives the Lemon Squeezy API key or webhook signing secret and cannot write its own billing
entitlement.

The callable functions enforce outgoing and incoming Free-plan limits on the server, maintain sharing usage counters,
and return the feed-owner policy used by the extension to project locked feeds and members.

## Validation

From the repository root:

```bash
npm run type-check
npm run test:functions
npm run build:functions
```

## Deployment

Deploy the functions together with their Firestore rules and indexes to the intended Firebase environment:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes --project staging
```

## Billing flow

The extension requests a short-lived handoff from `createBillingHandoff` and opens
`https://myfeedpilot.com/pricing#handoff=OPAQUE_TOKEN`. The pricing website posts the selected currency, interval, and
handoff token to `createWebsiteCheckout`, which creates the allowlisted Lemon Squeezy checkout. Signed webhook events
are processed by `lemonSqueezyWebhook` and update both the provider record and the canonical
`users/{uid}/billing/subscription` entitlement.

Staging requires the Test-mode Store/Variant IDs in `functions/.env.myfeedpilot-staging` plus the
`LEMON_SQUEEZY_API_KEY` and `LEMON_SQUEEZY_WEBHOOK_SECRET` Firebase secrets. Test and production must use separate
products, keys, secrets, and webhook endpoints.

The deploy must include Functions, billing rules, and TTL indexes together:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes --project staging
```

The exported billing endpoints are `createBillingCheckout`, `createBillingHandoff`, `createWebsiteCheckout`,
`claimGuestBillingSubscription`, `getBillingPortal`, and `lemonSqueezyWebhook`.
