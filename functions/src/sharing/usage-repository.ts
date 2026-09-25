import type { Firestore } from 'firebase-admin/firestore';
import type { SharingUsage } from './types.js';

function emptyUsage(now: number): SharingUsage {
  return {
    outgoingRecipientCount: 0,
    outgoingFeedCount: 0,
    incomingOwnerCount: 0,
    incomingFeedCount: 0,
    initializedAt: now,
    updatedAt: now,
  };
}

function getFollowedFeedLocation(data: FirebaseFirestore.DocumentData): { ownerId: string; feedId: string } | null {
  const ownerId = typeof data.ownerId === 'string' ? data.ownerId : '';
  const feedId = typeof data.feedId === 'string' ? data.feedId : '';
  if (!ownerId || !feedId || ownerId.includes('/') || feedId.includes('/')) return null;
  return { ownerId, feedId };
}

async function calculateUsage(db: Firestore, userId: string): Promise<SharingUsage> {
  const now = Date.now();
  const outgoingRecipients = new Set<string>();
  const outgoingFeeds = new Set<string>();
  const incomingOwners = new Set<string>();
  const incomingFeeds = new Set<string>();

  const [feedsSnapshot, followedSnapshot] = await Promise.all([
    db.collection(`users/${userId}/feeds`).get(),
    db.collection(`users/${userId}/followedFeeds`).get(),
  ]);

  const outgoingShareSnapshots = await Promise.all(
    feedsSnapshot.docs.map((feed) => feed.ref.collection('shares').get())
  );

  outgoingShareSnapshots.forEach((snapshot, index) => {
    if (!snapshot.empty) outgoingFeeds.add(feedsSnapshot.docs[index].id);
    snapshot.docs.forEach((share) => outgoingRecipients.add(share.id));
  });

  const incomingLocations = followedSnapshot.docs.map((followed) => getFollowedFeedLocation(followed.data()));
  const incomingShares = await Promise.all(
    incomingLocations.map((location) =>
      location ? db.doc(`users/${location.ownerId}/feeds/${location.feedId}/shares/${userId}`).get() : null
    )
  );

  incomingLocations.forEach((location, index) => {
    if (!location || !incomingShares[index]?.exists) return;
    incomingOwners.add(location.ownerId);
    incomingFeeds.add(`${location.ownerId}:${location.feedId}`);
  });

  return {
    ...emptyUsage(now),
    outgoingRecipientCount: outgoingRecipients.size,
    outgoingFeedCount: outgoingFeeds.size,
    incomingOwnerCount: incomingOwners.size,
    incomingFeedCount: incomingFeeds.size,
  };
}

export async function ensureSharingUsage(db: Firestore, userId: string): Promise<void> {
  const usageRef = db.doc(`sharingUsage/${userId}`);
  if ((await usageRef.get()).exists) return;

  const calculated = await calculateUsage(db, userId);
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(usageRef);
    if (!current.exists) transaction.create(usageRef, calculated);
  });
}

export async function countActivePairFeeds(db: Firestore, ownerId: string, recipientId: string): Promise<number> {
  const feeds = await db.collection(`users/${ownerId}/feeds`).get();
  const shareDocuments = await Promise.all(
    feeds.docs.map((feed) => feed.ref.collection('shares').doc(recipientId).get())
  );
  return shareDocuments.filter((share) => share.exists).length;
}

export async function countActiveFeedRecipients(db: Firestore, ownerId: string, feedId: string): Promise<number> {
  const shares = await db.collection(`users/${ownerId}/feeds/${feedId}/shares`).get();
  return shares.size;
}

export function readUsage(data: FirebaseFirestore.DocumentData | undefined): SharingUsage {
  const now = Date.now();
  const fallback = emptyUsage(now);
  return {
    outgoingRecipientCount: Number(data?.outgoingRecipientCount ?? fallback.outgoingRecipientCount),
    outgoingFeedCount: Number(data?.outgoingFeedCount ?? fallback.outgoingFeedCount),
    incomingOwnerCount: Number(data?.incomingOwnerCount ?? fallback.incomingOwnerCount),
    incomingFeedCount: Number(data?.incomingFeedCount ?? fallback.incomingFeedCount),
    initializedAt: Number(data?.initializedAt ?? fallback.initializedAt),
    updatedAt: Number(data?.updatedAt ?? fallback.updatedAt),
  };
}
