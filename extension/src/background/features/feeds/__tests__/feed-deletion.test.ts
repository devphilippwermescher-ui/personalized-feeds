import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('shared/firebase-config', () => ({
  getFirebaseDb: () => ({ type: 'mock-firestore' }),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  deleteDoc: mocks.deleteDoc,
  doc: (parent: unknown, ...segments: string[]) =>
    typeof parent === 'string' ? [parent, ...segments].join('/') : segments.join('/'),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  increment: vi.fn(),
  orderBy: vi.fn(),
  query: (reference: unknown) => reference,
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

import { deleteFeed } from 'shared/firestore/feeds';

describe('owned feed deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteDoc.mockResolvedValue(undefined);
    mocks.getDoc.mockImplementation(async (reference: unknown) => {
      if (reference === 'users/owner-1/feeds/feed-1') {
        return {
          exists: () => true,
          id: 'feed-1',
          data: () => ({ name: 'Shared feed', memberCount: 1 }),
        };
      }
      throw new Error(`Unexpected document read: ${String(reference)}`);
    });
    mocks.getDocs.mockImplementation(async (reference: unknown) => {
      if (reference === 'users/owner-1/feeds/feed-1/members') {
        return { docs: [{ ref: 'member-1' }] };
      }
      throw new Error(`Unexpected collection read: ${String(reference)}`);
    });
  });

  it('leaves protected share cleanup to the backend trigger', async () => {
    await deleteFeed('owner-1', 'feed-1');

    expect(mocks.getDocs).toHaveBeenCalledOnce();
    expect(mocks.deleteDoc).toHaveBeenCalledWith('member-1');
    expect(mocks.deleteDoc).toHaveBeenCalledWith('users/owner-1/feeds/feed-1');
  });

  it('skips a stale share token whose link was removed by an earlier partial deletion', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [] });
    mocks.getDoc.mockImplementation(async (reference: unknown) => {
      if (reference === 'users/owner-1/feeds/feed-1') {
        return {
          exists: () => true,
          id: 'feed-1',
          data: () => ({ name: 'Partially deleted feed', memberCount: 0, shareToken: 'stale-token' }),
        };
      }
      if (reference === 'feedShareLinks/stale-token') {
        return { exists: () => false, data: () => undefined };
      }
      throw new Error(`Unexpected document read: ${String(reference)}`);
    });

    await deleteFeed('owner-1', 'feed-1');

    expect(mocks.deleteDoc).toHaveBeenCalledOnce();
    expect(mocks.deleteDoc).toHaveBeenCalledWith('users/owner-1/feeds/feed-1');
  });
});
