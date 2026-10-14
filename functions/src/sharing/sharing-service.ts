import type { Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { hasProSharingAccess } from './plan.js';
import type { ShareMutationResult, ShareRole, ShareSource, SharingLimitResult } from './types.js';
import { countActiveFeedRecipients, countActivePairFeeds, ensureSharingUsage, readUsage } from './usage-repository.js';
import { findSharingLimitViolation } from './sharing-policy.js';
import { writeSharingLimitNotifications } from './limit-notification-repository.js';
import { writeSuccessfulEmailShareNotification } from './share-notification-repository.js';

interface CreateRelationshipInput {
  ownerId: string;
  recipientId: string;
  feedId: string;
  role: ShareRole;
  source: ShareSource;
  actorId: string;
}

function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 256 || value.includes('/')) {
    throw new Error(`Invalid ${label}`);
  }
}

function displayName(data: FirebaseFirestore.DocumentData | undefined, fallback: string): string {
  return typeof data?.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : fallback;
}

function email(data: FirebaseFirestore.DocumentData | undefined): string {
  return typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
}

async function createRelationship(db: Firestore, input: CreateRelationshipInput): Promise<ShareMutationResult> {
  assertId(input.ownerId, 'owner');
  assertId(input.recipientId, 'recipient');
  assertId(input.feedId, 'feed');
  if (input.ownerId === input.recipientId) throw new Error('You already own this feed');

  await Promise.all([ensureSharingUsage(db, input.ownerId), ensureSharingUsage(db, input.recipientId)]);
  const [legacyPairFeedCount, legacyFeedRecipientCount] = await Promise.all([
    countActivePairFeeds(db, input.ownerId, input.recipientId),
    countActiveFeedRecipients(db, input.ownerId, input.feedId),
  ]);

  return db.runTransaction(async (transaction): Promise<ShareMutationResult> => {
    const ownerUsageRef = db.doc(`sharingUsage/${input.ownerId}`);
    const recipientUsageRef = db.doc(`sharingUsage/${input.recipientId}`);
    const pairRef = db.doc(`sharingPairs/${input.ownerId}--${input.recipientId}`);
    const feedUsageRef = db.doc(`sharingFeedUsage/${input.ownerId}--${input.feedId}`);
    const feedRef = db.doc(`users/${input.ownerId}/feeds/${input.feedId}`);
    const ownerRef = db.doc(`users/${input.ownerId}`);
    const recipientRef = db.doc(`users/${input.recipientId}`);
    const ownerPlanRef = db.doc(`users/${input.ownerId}/billing/subscription`);
    const recipientPlanRef = db.doc(`users/${input.recipientId}/billing/subscription`);
    const shareRef = db.doc(`users/${input.ownerId}/feeds/${input.feedId}/shares/${input.recipientId}`);
    const followedRef = db.doc(`users/${input.recipientId}/followedFeeds/${input.ownerId}_${input.feedId}`);

    const [
      ownerUsageSnap,
      recipientUsageSnap,
      pairSnap,
      feedUsageSnap,
      feedSnap,
      ownerSnap,
      recipientSnap,
      ownerPlanSnap,
      recipientPlanSnap,
      shareSnap,
      followedSnap,
    ] = await transaction.getAll(
      ownerUsageRef,
      recipientUsageRef,
      pairRef,
      feedUsageRef,
      feedRef,
      ownerRef,
      recipientRef,
      ownerPlanRef,
      recipientPlanRef,
      shareRef,
      followedRef
    );

    if (!feedSnap.exists) throw new Error('Feed not found');
    if (!ownerSnap.exists || !recipientSnap.exists) throw new Error('User not found');

    const now = Date.now();
    const ownerName = displayName(ownerSnap.data(), 'Feed owner');
    const recipientName = displayName(recipientSnap.data(), 'Recipient');
    const recipientEmail = email(recipientSnap.data());
    const existingShare = shareSnap.data();
    const createdAt = typeof existingShare?.createdAt === 'number' ? existingShare.createdAt : now;
    const share = {
      targetUid: input.recipientId,
      targetEmail: recipientEmail,
      role: input.role,
      createdAt,
      updatedAt: now,
    };

    if (shareSnap.exists) {
      transaction.set(shareRef, share, { merge: true });
      transaction.set(
        followedRef,
        {
          ownerId: input.ownerId,
          feedId: input.feedId,
          role: input.role,
          followedAt: typeof followedSnap.get('followedAt') === 'number' ? followedSnap.get('followedAt') : now,
          sortOrder: typeof followedSnap.get('sortOrder') === 'number' ? followedSnap.get('sortOrder') : -now,
        },
        { merge: true }
      );
      return { success: true, share };
    }

    const ownerUsage = readUsage(ownerUsageSnap.data());
    const recipientUsage = readUsage(recipientUsageSnap.data());
    const pairFeedCount = pairSnap.exists ? Number(pairSnap.get('activeFeedCount') || 0) : legacyPairFeedCount;
    const feedRecipientCount = feedUsageSnap.exists
      ? Number(feedUsageSnap.get('activeRecipientCount') || 0)
      : legacyFeedRecipientCount;
    const actorIsOwner = input.actorId === input.ownerId;
    const violation = findSharingLimitViolation({
      ownerIsPro: hasProSharingAccess(ownerPlanSnap.data()),
      recipientIsPro: hasProSharingAccess(recipientPlanSnap.data()),
      pairFeedCount,
      feedRecipientCount,
      ownerUsage,
      recipientUsage,
      actorIsOwner,
    });

    if (violation) {
      const notificationCreated = writeSharingLimitNotifications({
        db,
        transaction,
        ownerId: input.ownerId,
        recipientId: input.recipientId,
        feedId: input.feedId,
        role: input.role,
        source: input.source,
        violation,
        feedName: typeof feedSnap.get('name') === 'string' ? feedSnap.get('name') : 'Shared feed',
        ownerName,
        recipientName,
        now,
      });
      const blockedUserId = violation.direction === 'outgoing' ? input.ownerId : input.recipientId;
      const limit: SharingLimitResult = {
        code: 'SHARING_LIMIT_REACHED',
        direction: violation.direction,
        dimension: violation.dimension,
        blockedParty: blockedUserId === input.actorId ? 'current_user' : 'counterparty',
        limit: violation.limit,
        counterpartDisplayName: actorIsOwner ? recipientName : ownerName,
        notificationCreated,
      };
      return { success: false, error: 'Sharing limit reached', sharingLimit: limit };
    }

    const newPair = pairFeedCount === 0;
    const newOutgoingFeed = feedRecipientCount === 0;
    transaction.set(shareRef, share);
    transaction.set(followedRef, {
      ownerId: input.ownerId,
      feedId: input.feedId,
      role: input.role,
      followedAt: now,
      sortOrder: -now,
    });
    transaction.set(pairRef, {
      ownerId: input.ownerId,
      recipientId: input.recipientId,
      activeFeedCount: pairFeedCount + 1,
      updatedAt: now,
    });
    transaction.set(feedUsageRef, {
      ownerId: input.ownerId,
      feedId: input.feedId,
      activeRecipientCount: feedRecipientCount + 1,
      updatedAt: now,
    });
    transaction.set(ownerUsageRef, {
      ...ownerUsage,
      outgoingRecipientCount: ownerUsage.outgoingRecipientCount + (newPair ? 1 : 0),
      outgoingFeedCount: ownerUsage.outgoingFeedCount + (newOutgoingFeed ? 1 : 0),
      updatedAt: now,
    });
    transaction.set(recipientUsageRef, {
      ...recipientUsage,
      incomingOwnerCount: recipientUsage.incomingOwnerCount + (newPair ? 1 : 0),
      incomingFeedCount: recipientUsage.incomingFeedCount + 1,
      updatedAt: now,
    });

    if (input.source === 'email') {
      writeSuccessfulEmailShareNotification({
        db,
        transaction,
        ownerId: input.ownerId,
        recipientId: input.recipientId,
        feedId: input.feedId,
        feedName: typeof feedSnap.get('name') === 'string' ? feedSnap.get('name') : 'Shared feed',
        ownerName,
        recipientName,
        role: input.role,
        now,
      });
    }

    return {
      success: true,
      share,
      sharedFeed: {
        id: feedSnap.id,
        ...feedSnap.data(),
        role: input.role,
        ownerDisplayName: ownerName,
        ownerEmail: email(ownerSnap.data()),
        ownerPhotoURL: ownerSnap.get('photoURL') || undefined,
        followedAt: now,
        followedFeedId: `${input.ownerId}_${input.feedId}`,
        followedSortOrder: -now,
      },
    };
  });
}

export async function shareFeedWithEmail(
  db: Firestore,
  ownerId: string,
  feedId: string,
  targetEmail: string,
  role: ShareRole
): Promise<ShareMutationResult> {
  const normalizedEmail = targetEmail.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Email is required');
  const emailIndex = await db.doc(`emailIndex/${normalizedEmail}`).get();
  const recipientId = emailIndex.get('uid');
  if (typeof recipientId !== 'string' || !recipientId) {
    throw new Error('No myFeedPilot user found for this email');
  }
  const authenticatedRecipient = await getAuth().getUser(recipientId);
  if (authenticatedRecipient.email?.trim().toLowerCase() !== normalizedEmail) {
    throw new Error('No myFeedPilot user found for this email');
  }
  return createRelationship(db, { ownerId, recipientId, feedId, role, source: 'email', actorId: ownerId });
}

export async function followSharedFeedLink(
  db: Firestore,
  recipientId: string,
  token: string
): Promise<ShareMutationResult> {
  assertId(token, 'share token');
  const link = await db.doc(`feedShareLinks/${token}`).get();
  if (!link.exists) throw new Error('This shared feed link is invalid or expired');
  const ownerId = link.get('ownerId');
  const feedId = link.get('feedId');
  assertId(ownerId, 'link owner');
  assertId(feedId, 'linked feed');
  const role: ShareRole = link.get('role') === 'editor' ? 'editor' : 'reader';
  return createRelationship(db, { ownerId, recipientId, feedId, role, source: 'link', actorId: recipientId });
}

export async function acceptShareNotification(
  db: Firestore,
  recipientId: string,
  notificationIdValue: string
): Promise<ShareMutationResult> {
  assertId(notificationIdValue, 'notification');
  const notificationRef = db.doc(`users/${recipientId}/shareNotifications/${notificationIdValue}`);
  const notification = await notificationRef.get();
  if (
    !notification.exists ||
    notification.get('kind') !== 'incoming_share_blocked' ||
    notification.get('status') !== 'pending'
  ) {
    throw new Error('This shared-feed invitation is no longer available');
  }
  const ownerId = notification.get('ownerId');
  const feedId = notification.get('feedId');
  assertId(ownerId, 'notification owner');
  assertId(feedId, 'notification feed');
  const role: ShareRole = notification.get('role') === 'editor' ? 'editor' : 'reader';
  const result = await createRelationship(db, {
    ownerId,
    recipientId,
    feedId,
    role,
    source: 'notification',
    actorId: recipientId,
  });
  if (result.success) {
    await notificationRef.set({ status: 'accepted', updatedAt: Date.now() }, { merge: true });
  }
  return result;
}
