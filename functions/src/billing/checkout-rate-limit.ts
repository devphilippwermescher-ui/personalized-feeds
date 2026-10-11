import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

const RATE_LIMIT_COLLECTION = 'billingCheckoutRateLimits';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = {
  'firebase-user': 10,
  'website-ip': 30,
} as const;

export type BillingRateLimitScope = keyof typeof RATE_LIMIT_MAX_REQUESTS;

export class BillingRateLimitError extends Error {
  constructor() {
    super('Billing checkout rate limit exceeded');
    this.name = 'BillingRateLimitError';
  }
}

export async function enforceCheckoutRateLimit(params: {
  db: Firestore;
  scope: BillingRateLimitScope;
  fingerprint: string;
  now?: number;
}): Promise<void> {
  const now = params.now ?? Date.now();
  const documentId = createHash('sha256')
    .update(`${params.scope}:${params.fingerprint || 'unknown'}`, 'utf8')
    .digest('hex');
  const reference = params.db.collection(RATE_LIMIT_COLLECTION).doc(documentId);

  await params.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previousWindowStart = snapshot.get('windowStart');
    const previousCount = snapshot.get('count');
    const windowStart =
      typeof previousWindowStart === 'number' && previousWindowStart + RATE_LIMIT_WINDOW_MS > now
        ? previousWindowStart
        : now;
    const count = windowStart === previousWindowStart && typeof previousCount === 'number' ? previousCount + 1 : 1;
    if (count > RATE_LIMIT_MAX_REQUESTS[params.scope]) throw new BillingRateLimitError();
    transaction.set(reference, {
      windowStart,
      count,
      deleteAt: Timestamp.fromMillis(windowStart + RATE_LIMIT_WINDOW_MS),
    });
  });
}
