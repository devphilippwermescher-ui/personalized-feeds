import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  BillingHandoffError,
  completeBillingHandoff,
  createBillingHandoff,
  releaseBillingHandoff,
  reserveBillingHandoff,
} from '../handoff-repository.js';

describe('billing handoffs', () => {
  it('stores only a token hash and enforces one active reservation', async () => {
    const documents = new Map<string, Record<string, unknown>>();
    const doc = (path: string) => ({ path });
    const db = {
      collection: (path: string) => ({
        doc: (id: string) => ({
          path: `${path}/${id}`,
          set: async (data: Record<string, unknown>) => documents.set(`${path}/${id}`, data),
        }),
      }),
      runTransaction: async <T>(callback: (transaction: unknown) => Promise<T>) =>
        callback({
          get: async (reference: { path: string }) => {
            const data = documents.get(reference.path);
            return {
              exists: data !== undefined,
              data: () => data,
              get: (field: string) => data?.[field],
            };
          },
          set: (reference: { path: string }, data: Record<string, unknown>) => {
            documents.set(reference.path, { ...documents.get(reference.path), ...data });
          },
          update: (reference: { path: string }, data: Record<string, unknown>) => {
            documents.set(reference.path, { ...documents.get(reference.path), ...data });
          },
        }),
      doc,
    } as unknown as Firestore;

    const created = await createBillingHandoff({
      db,
      userId: 'firebase-user',
      email: 'user@example.com',
      now: 1_000,
    });
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [[storedPath, storedHandoff]] = [...documents.entries()];
    expect(storedPath).not.toContain(created.token);
    expect(JSON.stringify(storedHandoff)).not.toContain(created.token);

    const reserved = await reserveBillingHandoff({ db, token: created.token, now: 2_000 });
    expect(reserved).toMatchObject({ userId: 'firebase-user', email: 'user@example.com' });
    await expect(reserveBillingHandoff({ db, token: created.token, now: 2_001 })).rejects.toMatchObject({
      code: 'HANDOFF_USED',
    } satisfies Partial<BillingHandoffError>);

    await releaseBillingHandoff({ db, token: created.token, reservationId: reserved.reservationId });
    const reservedAgain = await reserveBillingHandoff({ db, token: created.token, now: 2_002 });
    await completeBillingHandoff({
      db,
      token: created.token,
      reservationId: reservedAgain.reservationId,
      checkoutSessionId: 'checkout-session',
      now: 3_000,
    });
    await expect(reserveBillingHandoff({ db, token: created.token, now: 3_001 })).rejects.toMatchObject({
      code: 'HANDOFF_USED',
    } satisfies Partial<BillingHandoffError>);
  });
});
