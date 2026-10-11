import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import {
  BillingCheckoutInProgressError,
  completeCheckoutSession,
  createCheckoutSession,
  createGuestCheckoutSession,
} from '../checkout-session-repository.js';

function createTransactionalDb() {
  const documents = new Map<string, Record<string, unknown>>();
  let transactionQueue = Promise.resolve();
  const reference = (path: string) => ({
    path,
    set: vi.fn(async (value: Record<string, unknown>) => documents.set(path, value)),
    delete: vi.fn(async () => documents.delete(path)),
  });
  const snapshot = (path: string) => ({
    exists: documents.has(path),
    data: () => documents.get(path),
    get: (field: string) => documents.get(path)?.[field],
  });
  const db = {
    collection: (path: string) => ({ doc: (id: string) => reference(`${path}/${id}`) }),
    runTransaction: <T>(callback: (transaction: unknown) => Promise<T>): Promise<T> => {
      const result = transactionQueue.then(() =>
        callback({
          get: async (ref: { path: string }) => snapshot(ref.path),
          set: (ref: { path: string }, value: Record<string, unknown>, options?: { merge?: boolean }) => {
            documents.set(ref.path, options?.merge ? { ...documents.get(ref.path), ...value } : value);
          },
          delete: (ref: { path: string }) => documents.delete(ref.path),
        })
      );
      transactionQueue = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  } as unknown as Firestore;
  return { db, documents };
}

describe('billing checkout sessions', () => {
  it('stores the Firebase identity only in a short-lived server-owned document', async () => {
    const { db, documents } = createTransactionalDb();

    const result = await createCheckoutSession({
      db,
      userId: 'firebase-user',
      configuration: {
        currency: 'EUR',
        storeId: '84',
        variants: { monthly: 'monthly-variant', annual: 'annual-variant' },
      },
      interval: 'annual',
      testMode: true,
      now: 1_000,
    });

    expect(result.state).toBe('created');
    if (result.state !== 'created') throw new Error('Expected a newly created checkout session');
    expect(result.sessionId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(documents.get(`billingCheckoutSessions/${result.sessionId}`)).toEqual(
      expect.objectContaining({
        identityType: 'user',
        userId: 'firebase-user',
        storeId: '84',
        variantId: 'annual-variant',
        currency: 'EUR',
        interval: 'annual',
        testMode: true,
        createdAt: 1_000,
        checkoutExpiresAt: 301_000,
        expiresAt: 601_000,
      })
    );
    expect(result.session.deleteAt.toMillis()).toBe(601_000);
    expect(documents.get('billingUserCheckoutLocks/firebase-user')).toEqual(
      expect.objectContaining({
        sessionId: result.sessionId,
        status: 'creating',
        checkoutExpiresAt: 301_000,
        expiresAt: 11_000,
      })
    );
  });

  it('creates a guest session without storing a guessed Firebase identity', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn().mockReturnValue({ set });
    const collection = vi.fn().mockReturnValue({ doc });
    const db = { collection } as unknown as Firestore;

    await createGuestCheckoutSession({
      db,
      configuration: {
        currency: 'USD',
        storeId: '42',
        variants: { monthly: 'monthly-variant', annual: 'annual-variant' },
      },
      interval: 'monthly',
      testMode: true,
      now: 1_000,
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        identityType: 'guest',
        storeId: '42',
        variantId: 'monthly-variant',
      })
    );
    expect(set.mock.calls[0]?.[0]).not.toHaveProperty('userId');
  });

  it('serializes concurrent checkout attempts for the same Firebase user', async () => {
    const { db } = createTransactionalDb();
    const input = {
      db,
      userId: 'firebase-user',
      configuration: {
        currency: 'USD' as const,
        storeId: '42',
        variants: { monthly: '100', annual: '101' },
      },
      interval: 'monthly' as const,
      testMode: true,
      now: 1_000,
    };

    const results = await Promise.allSettled([createCheckoutSession(input), createCheckoutSession(input)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(BillingCheckoutInProgressError);
    expect(rejected?.reason).toMatchObject({
      state: 'creating',
      currency: 'USD',
      interval: 'monthly',
      retryAfterSeconds: 10,
    });
  });

  it('returns the same ready checkout instead of creating a second provider checkout', async () => {
    const { db, documents } = createTransactionalDb();
    const input = {
      db,
      userId: 'firebase-user',
      configuration: {
        currency: 'USD' as const,
        storeId: '42',
        variants: { monthly: '100', annual: '101' },
      },
      interval: 'monthly' as const,
      testMode: true,
      now: 1_000,
    };
    const first = await createCheckoutSession(input);
    if (first.state !== 'created') throw new Error('Expected a newly created checkout session');
    await completeCheckoutSession({
      db,
      userId: input.userId,
      sessionId: first.sessionId,
      checkoutUrl: 'https://store.lemonsqueezy.com/checkout/custom/checkout-id',
    });

    expect(documents.get('billingUserCheckoutLocks/firebase-user')).toEqual(
      expect.objectContaining({
        status: 'ready',
        expiresAt: 301_000,
      })
    );

    const second = await createCheckoutSession({ ...input, now: 2_000 });

    expect(second).toEqual({
      state: 'ready',
      sessionId: first.sessionId,
      checkoutUrl: 'https://store.lemonsqueezy.com/checkout/custom/checkout-id',
    });
  });

  it('reports the existing USD checkout when the user switches to EUR', async () => {
    const { db } = createTransactionalDb();
    const baseInput = {
      db,
      userId: 'firebase-user',
      configuration: {
        currency: 'USD' as const,
        storeId: '42',
        variants: { monthly: '100', annual: '101' },
      },
      testMode: true,
      now: 1_000,
    };
    const first = await createCheckoutSession({ ...baseInput, interval: 'monthly' });
    if (first.state !== 'created') throw new Error('Expected a newly created checkout session');
    await completeCheckoutSession({
      db,
      userId: baseInput.userId,
      sessionId: first.sessionId,
      checkoutUrl: 'https://store.lemonsqueezy.com/checkout/custom/checkout-id',
    });

    await expect(
      createCheckoutSession({
        ...baseInput,
        configuration: {
          currency: 'EUR',
          storeId: '84',
          variants: { monthly: '200', annual: '201' },
        },
        interval: 'monthly',
        now: 2_000,
      })
    ).rejects.toMatchObject({
      name: 'BillingCheckoutInProgressError',
      state: 'ready',
      currency: 'USD',
      interval: 'monthly',
      retryAfterSeconds: 299,
    });
  });

  it('allows a new checkout after the short creation lock expires', async () => {
    const { db } = createTransactionalDb();
    const input = {
      db,
      userId: 'firebase-user',
      configuration: {
        currency: 'USD' as const,
        storeId: '42',
        variants: { monthly: '100', annual: '101' },
      },
      interval: 'monthly' as const,
      testMode: true,
    };

    const first = await createCheckoutSession({ ...input, now: 1_000 });
    const second = await createCheckoutSession({ ...input, now: 11_001 });

    expect(first.state).toBe('created');
    expect(second.state).toBe('created');
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('allows a different selection after the ready checkout expires', async () => {
    const { db } = createTransactionalDb();
    const input = {
      db,
      userId: 'firebase-user',
      configuration: {
        currency: 'USD' as const,
        storeId: '42',
        variants: { monthly: '100', annual: '101' },
      },
      testMode: true,
    };
    const first = await createCheckoutSession({ ...input, interval: 'monthly', now: 1_000 });
    if (first.state !== 'created') throw new Error('Expected a newly created checkout session');
    await completeCheckoutSession({
      db,
      userId: input.userId,
      sessionId: first.sessionId,
      checkoutUrl: 'https://store.lemonsqueezy.com/checkout/custom/checkout-id',
    });

    const second = await createCheckoutSession({ ...input, interval: 'annual', now: 301_001 });

    expect(second.state).toBe('created');
    expect(second.sessionId).not.toBe(first.sessionId);
  });
});
