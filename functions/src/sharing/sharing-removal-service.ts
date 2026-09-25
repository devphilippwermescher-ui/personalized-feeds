import type { Firestore } from 'firebase-admin/firestore';
import {
  countActiveFeedRecipients,
  countActivePairFeeds,
  ensureSharingUsage,
  readUsage,
} from './usage-repository.js';

function assertId(value: string, label: string): void {
  if (!value || value.length > 256 || value.includes('/')) throw new Error(`Invalid ${label}`);
}

export async function removeShareRelationship(
  db: Firestore,
  ownerId: string,
  recipientId: string,
  feedId: string
): Promise<void> {
  assertId(ownerId, 'owner');
  assertId(recipientId, 'recipient');
  assertId(feedId, 'feed');
  await Promise.all([ensureSharingUsage(db, ownerId), ensureSharingUsage(db, recipientId)]);
  const [legacyPairFeedCount, legacyFeedRecipientCount] = await Promise.all([
    countActivePairFeeds(db, ownerId, recipientId),
    countActiveFeedRecipients(db, ownerId, feedId),
  ]);

  await db.runTransaction(async (transaction) => {
    const ownerUsageRef = db.doc(`sharingUsage/${ownerId}`);
    const recipientUsageRef = db.doc(`sharingUsage/${recipientId}`);
    const pairRef = db.doc(`sharingPairs/${ownerId}--${recipientId}`);
    const feedUsageRef = db.doc(`sharingFeedUsage/${ownerId}--${feedId}`);
    const shareRef = db.doc(`users/${ownerId}/feeds/${feedId}/shares/${recipientId}`);
    const followedRef = db.doc(`users/${recipientId}/followedFeeds/${ownerId}_${feedId}`);
    const [ownerUsageSnap, recipientUsageSnap, pairSnap, feedUsageSnap, shareSnap] = await transaction.getAll(
      ownerUsageRef,
      recipientUsageRef,
      pairRef,
      feedUsageRef,
      shareRef
    );

    transaction.delete(followedRef);
    if (!shareSnap.exists) return;
    transaction.delete(shareRef);

    const now = Date.now();
    const ownerUsage = readUsage(ownerUsageSnap.data());
    const recipientUsage = readUsage(recipientUsageSnap.data());
    const pairFeedCount = pairSnap.exists ? Number(pairSnap.get('activeFeedCount') || 0) : legacyPairFeedCount;
    const feedRecipientCount = feedUsageSnap.exists
      ? Number(feedUsageSnap.get('activeRecipientCount') || 0)
      : legacyFeedRecipientCount;
    const removesPair = pairFeedCount <= 1;
    const removesOutgoingFeed = feedRecipientCount <= 1;

    if (removesPair) transaction.delete(pairRef);
    else transaction.set(pairRef, { activeFeedCount: pairFeedCount - 1, updatedAt: now }, { merge: true });
    if (removesOutgoingFeed) transaction.delete(feedUsageRef);
    else
      transaction.set(feedUsageRef, { activeRecipientCount: feedRecipientCount - 1, updatedAt: now }, { merge: true });

    transaction.set(ownerUsageRef, {
      ...ownerUsage,
      outgoingRecipientCount: Math.max(0, ownerUsage.outgoingRecipientCount - (removesPair ? 1 : 0)),
      outgoingFeedCount: Math.max(0, ownerUsage.outgoingFeedCount - (removesOutgoingFeed ? 1 : 0)),
      updatedAt: now,
    });
    transaction.set(recipientUsageRef, {
      ...recipientUsage,
      incomingOwnerCount: Math.max(0, recipientUsage.incomingOwnerCount - (removesPair ? 1 : 0)),
      incomingFeedCount: Math.max(0, recipientUsage.incomingFeedCount - 1),
      updatedAt: now,
    });
  });
}
