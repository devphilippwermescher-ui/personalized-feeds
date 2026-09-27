# myFeedPilot sharing functions

Firebase Functions owns the trusted shared-feed operations used by the Free extension release.

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

The Free release exports sharing functions only. Pro purchasing and payment processing are intentionally not part of
this branch.
