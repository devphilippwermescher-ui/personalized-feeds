import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

const HANDOFF_COLLECTION = 'billingHandoffs';
const HANDOFF_LIFETIME_MS = 10 * 60 * 1000;
const HANDOFF_RESERVATION_LIFETIME_MS = 60 * 1000;
const HANDOFF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface BillingHandoffWriteModel {
  userId: string;
  email?: string;
  createdAt: number;
  expiresAt: number;
  deleteAt: Timestamp;
  reservationId?: string;
  reservedAt?: number;
  consumedAt?: number;
  checkoutSessionId?: string;
}

export class BillingHandoffError extends Error {
  constructor(readonly code: 'HANDOFF_INVALID' | 'HANDOFF_EXPIRED' | 'HANDOFF_USED') {
    super(code);
    this.name = 'BillingHandoffError';
  }
}

function hashHandoffToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createBillingHandoff(params: {
  db: Firestore;
  userId: string;
  email?: string;
  now?: number;
}): Promise<{ token: string; expiresAt: number }> {
  if (!params.userId || params.userId.length > 128 || params.userId.includes('/')) {
    throw new Error('Cannot create a billing handoff for an invalid Firebase user ID');
  }
  const now = params.now ?? Date.now();
  const expiresAt = now + HANDOFF_LIFETIME_MS;
  const token = randomBytes(32).toString('base64url');
  const handoff: BillingHandoffWriteModel = {
    userId: params.userId,
    ...(params.email ? { email: params.email } : {}),
    createdAt: now,
    expiresAt,
    deleteAt: Timestamp.fromMillis(expiresAt),
  };
  await params.db.collection(HANDOFF_COLLECTION).doc(hashHandoffToken(token)).set(handoff);
  return { token, expiresAt };
}

export async function reserveBillingHandoff(params: {
  db: Firestore;
  token: string;
  now?: number;
}): Promise<{ reservationId: string; userId: string; email?: string }> {
  if (!HANDOFF_TOKEN_PATTERN.test(params.token)) {
    throw new BillingHandoffError('HANDOFF_INVALID');
  }
  const now = params.now ?? Date.now();
  const reservationId = randomUUID();
  const reference = params.db.collection(HANDOFF_COLLECTION).doc(hashHandoffToken(params.token));

  return params.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new BillingHandoffError('HANDOFF_INVALID');
    const data = snapshot.data() as Partial<BillingHandoffWriteModel>;
    if (typeof data.expiresAt !== 'number' || data.expiresAt <= now) {
      throw new BillingHandoffError('HANDOFF_EXPIRED');
    }
    if (typeof data.consumedAt === 'number') throw new BillingHandoffError('HANDOFF_USED');
    if (
      typeof data.reservationId === 'string' &&
      typeof data.reservedAt === 'number' &&
      data.reservedAt + HANDOFF_RESERVATION_LIFETIME_MS > now
    ) {
      throw new BillingHandoffError('HANDOFF_USED');
    }
    if (typeof data.userId !== 'string' || !data.userId || data.userId.includes('/')) {
      throw new BillingHandoffError('HANDOFF_INVALID');
    }
    transaction.set(reference, { reservationId, reservedAt: now }, { merge: true });
    return {
      reservationId,
      userId: data.userId,
      ...(typeof data.email === 'string' && data.email ? { email: data.email } : {}),
    };
  });
}

export async function completeBillingHandoff(params: {
  db: Firestore;
  token: string;
  reservationId: string;
  checkoutSessionId: string;
  now?: number;
}): Promise<void> {
  const reference = params.db.collection(HANDOFF_COLLECTION).doc(hashHandoffToken(params.token));
  await params.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get('reservationId') !== params.reservationId) {
      throw new BillingHandoffError('HANDOFF_USED');
    }
    transaction.set(
      reference,
      {
        consumedAt: params.now ?? Date.now(),
        checkoutSessionId: params.checkoutSessionId,
      },
      { merge: true }
    );
  });
}

export async function releaseBillingHandoff(params: {
  db: Firestore;
  token: string;
  reservationId: string;
}): Promise<void> {
  const reference = params.db.collection(HANDOFF_COLLECTION).doc(hashHandoffToken(params.token));
  await params.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.get('reservationId') !== params.reservationId || snapshot.get('consumedAt')) {
      return;
    }
    transaction.update(reference, {
      reservationId: null,
      reservedAt: null,
    });
  });
}
