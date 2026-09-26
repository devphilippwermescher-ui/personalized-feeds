import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { SharingLimitViolation } from './sharing-policy.js';
import type { ShareNotificationData, ShareRole, ShareSource } from './types.js';

function notificationId(ownerId: string, recipientId: string, feedId: string, suffix: string): string {
  return `${ownerId}--${recipientId}--${feedId}--${suffix}`;
}

export function writeSharingLimitNotifications(params: {
  db: Firestore;
  transaction: Transaction;
  ownerId: string;
  recipientId: string;
  feedId: string;
  role: ShareRole;
  source: ShareSource;
  violation: SharingLimitViolation;
  feedName: string;
  ownerName: string;
  recipientName: string;
  now: number;
}): boolean {
  const common = {
    ownerId: params.ownerId,
    recipientId: params.recipientId,
    feedId: params.feedId,
    feedName: params.feedName,
    ownerDisplayName: params.ownerName,
    recipientDisplayName: params.recipientName,
    role: params.role,
    limitDirection: params.violation.direction,
    limitDimension: params.violation.dimension,
    createdAt: params.now,
    updatedAt: params.now,
  } as const;

  if (params.violation.direction === 'incoming') {
    const recipientNotification: ShareNotificationData = {
      ...common,
      kind: 'incoming_share_blocked',
      status: 'pending',
    };
    params.transaction.set(
      params.db.doc(
        `users/${params.recipientId}/shareNotifications/${notificationId(params.ownerId, params.recipientId, params.feedId, 'incoming')}`
      ),
      recipientNotification,
      { merge: true }
    );

    if (params.source === 'link') {
      const ownerNotification: ShareNotificationData = {
        ...common,
        kind: 'link_follow_blocked_recipient',
        status: 'unread',
      };
      params.transaction.set(
        params.db.doc(
          `users/${params.ownerId}/shareNotifications/${notificationId(params.ownerId, params.recipientId, params.feedId, 'recipient-limit')}`
        ),
        ownerNotification,
        { merge: true }
      );
    }
    return true;
  }

  if (params.source === 'link') {
    const ownerNotification: ShareNotificationData = {
      ...common,
      kind: 'link_follow_blocked_owner',
      status: 'unread',
    };
    params.transaction.set(
      params.db.doc(
        `users/${params.ownerId}/shareNotifications/${notificationId(params.ownerId, params.recipientId, params.feedId, 'owner-limit')}`
      ),
      ownerNotification,
      { merge: true }
    );
    return true;
  }

  return false;
}
