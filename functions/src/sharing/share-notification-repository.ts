import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { ShareNotificationData, ShareRole } from './types.js';

export function writeSuccessfulEmailShareNotification(params: {
  db: Firestore;
  transaction: Transaction;
  ownerId: string;
  recipientId: string;
  feedId: string;
  feedName: string;
  ownerName: string;
  recipientName: string;
  role: ShareRole;
  now: number;
}): void {
  const notification: ShareNotificationData = {
    kind: 'incoming_share_added',
    status: 'unread',
    ownerId: params.ownerId,
    recipientId: params.recipientId,
    feedId: params.feedId,
    feedName: params.feedName,
    ownerDisplayName: params.ownerName,
    recipientDisplayName: params.recipientName,
    role: params.role,
    createdAt: params.now,
    updatedAt: params.now,
  };

  params.transaction.set(
    params.db.doc(
      `users/${params.recipientId}/shareNotifications/${params.ownerId}--${params.recipientId}--${params.feedId}--shared`
    ),
    notification,
    { merge: true }
  );
}
