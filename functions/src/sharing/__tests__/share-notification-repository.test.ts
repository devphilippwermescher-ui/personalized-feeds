import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { writeSuccessfulEmailShareNotification } from '../share-notification-repository.js';

describe('successful email share notifications', () => {
  it('writes an unread notification for the recipient in the same transaction', () => {
    const notificationRef = { path: 'notification' };
    const db = {
      doc: vi.fn(() => notificationRef),
    } as unknown as Firestore;
    const transaction = {
      set: vi.fn(),
    } as unknown as Transaction;

    writeSuccessfulEmailShareNotification({
      db,
      transaction,
      ownerId: 'owner',
      recipientId: 'recipient',
      feedId: 'feed',
      feedName: 'Engineering',
      ownerName: 'Olena',
      recipientName: 'Alex',
      role: 'reader',
      now: 123,
    });

    expect(db.doc).toHaveBeenCalledWith('users/recipient/shareNotifications/owner--recipient--feed--shared');
    expect(transaction.set).toHaveBeenCalledWith(
      notificationRef,
      {
        kind: 'incoming_share_added',
        status: 'unread',
        ownerId: 'owner',
        recipientId: 'recipient',
        feedId: 'feed',
        feedName: 'Engineering',
        ownerDisplayName: 'Olena',
        recipientDisplayName: 'Alex',
        role: 'reader',
        createdAt: 123,
        updatedAt: 123,
      },
      { merge: true }
    );
  });
});
