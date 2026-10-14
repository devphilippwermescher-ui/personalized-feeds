import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { BillingRateLimitError, enforceCheckoutRateLimit } from '../checkout-rate-limit.js';

function createRateLimitDb(): Firestore {
  const documents = new Map<string, Record<string, unknown>>();
  return {
    collection: (path: string) => ({
      doc: (id: string) => ({ path: `${path}/${id}` }),
    }),
    runTransaction: async <T>(callback: (transaction: unknown) => Promise<T>) =>
      callback({
        get: async (reference: { path: string }) => ({
          get: (field: string) => documents.get(reference.path)?.[field],
        }),
        set: (reference: { path: string }, value: Record<string, unknown>) => {
          documents.set(reference.path, value);
        },
      }),
  } as unknown as Firestore;
}

describe('billing checkout rate limit', () => {
  it('limits authenticated checkout attempts per Firebase user', async () => {
    const db = createRateLimitDb();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await enforceCheckoutRateLimit({
        db,
        scope: 'firebase-user',
        fingerprint: 'firebase-user',
        now: 1_000,
      });
    }

    await expect(
      enforceCheckoutRateLimit({
        db,
        scope: 'firebase-user',
        fingerprint: 'firebase-user',
        now: 1_000,
      })
    ).rejects.toBeInstanceOf(BillingRateLimitError);
  });

  it('isolates website IP and Firebase user counters', async () => {
    const db = createRateLimitDb();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await enforceCheckoutRateLimit({
        db,
        scope: 'firebase-user',
        fingerprint: 'same-value',
        now: 1_000,
      });
    }

    await expect(
      enforceCheckoutRateLimit({
        db,
        scope: 'website-ip',
        fingerprint: 'same-value',
        now: 1_000,
      })
    ).resolves.toBeUndefined();
  });

  it('starts a new window after ten minutes', async () => {
    const db = createRateLimitDb();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await enforceCheckoutRateLimit({
        db,
        scope: 'firebase-user',
        fingerprint: 'firebase-user',
        now: 1_000,
      });
    }

    await expect(
      enforceCheckoutRateLimit({
        db,
        scope: 'firebase-user',
        fingerprint: 'firebase-user',
        now: 601_000,
      })
    ).resolves.toBeUndefined();
  });
});
