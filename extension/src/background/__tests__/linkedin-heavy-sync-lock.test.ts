import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireConnectionHistorySyncLock,
  getActiveLinkedInHeavySyncLock,
  LINKEDIN_HEAVY_SYNC_LOCK_KEY,
  releaseConnectionHistorySyncLock,
} from '../linkedin-heavy-sync-lock';

describe('LinkedIn heavy sync lock', () => {
  const storage: Record<string, unknown> = {};

  beforeEach(() => {
    Object.keys(storage).forEach((key) => delete storage[key]);
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => Object.assign(storage, values)),
          remove: vi.fn(async (key: string) => delete storage[key]),
        },
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('persists and refreshes one account-scoped lock', async () => {
    const first = await acquireConnectionHistorySyncLock({
      userId: 'user',
      accountKey: 'profile:example',
      now: 1_000,
      ttlMs: 10_000,
    });
    const refreshed = await acquireConnectionHistorySyncLock({
      userId: 'user',
      accountKey: 'profile:example',
      now: 2_000,
      ttlMs: 20_000,
    });

    expect(first.acquiredAt).toBe(1_000);
    expect(refreshed).toMatchObject({ acquiredAt: 1_000, refreshedAt: 2_000, expiresAt: 22_000 });
    expect(await getActiveLinkedInHeavySyncLock('user', 3_000)).toEqual(refreshed);
  });

  it('removes expired and explicitly released locks', async () => {
    await acquireConnectionHistorySyncLock({
      userId: 'user',
      accountKey: 'profile:example',
      now: 1_000,
      ttlMs: 1_000,
    });
    expect(await getActiveLinkedInHeavySyncLock('user', 2_001)).toBeNull();
    expect(storage[LINKEDIN_HEAVY_SYNC_LOCK_KEY]).toBeUndefined();

    await acquireConnectionHistorySyncLock({ userId: 'user', accountKey: 'profile:example', now: 3_000 });
    await releaseConnectionHistorySyncLock('user', 'profile:example');
    expect(storage[LINKEDIN_HEAVY_SYNC_LOCK_KEY]).toBeUndefined();
  });
});
