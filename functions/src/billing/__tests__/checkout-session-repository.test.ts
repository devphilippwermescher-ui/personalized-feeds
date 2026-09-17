import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { createCheckoutSession } from '../checkout-session-repository.js';

describe('billing checkout sessions', () => {
  it('stores the Firebase identity only in a short-lived server-owned document', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn().mockReturnValue({ set });
    const collection = vi.fn().mockReturnValue({ doc });
    const db = { collection } as unknown as Firestore;

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

    expect(result.sessionId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(collection).toHaveBeenCalledWith('billingCheckoutSessions');
    expect(doc).toHaveBeenCalledWith(result.sessionId);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'firebase-user',
        storeId: '84',
        variantId: 'annual-variant',
        currency: 'EUR',
        interval: 'annual',
        testMode: true,
        createdAt: 1_000,
        checkoutExpiresAt: 1_801_000,
        expiresAt: 2_101_000,
      })
    );
    expect(result.session.deleteAt.toMillis()).toBe(2_101_000);
  });
});
