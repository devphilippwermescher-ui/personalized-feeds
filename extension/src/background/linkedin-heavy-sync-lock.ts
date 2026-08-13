export const LINKEDIN_HEAVY_SYNC_LOCK_KEY = 'mfp_linkedin_heavy_sync_lock_v1';
export const LINKEDIN_HEAVY_SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

export interface LinkedInHeavySyncLock {
  version: 1;
  owner: 'connections_history_bootstrap';
  userId: string;
  accountKey: string;
  acquiredAt: number;
  refreshedAt: number;
  expiresAt: number;
}

export async function getActiveLinkedInHeavySyncLock(
  userId?: string,
  now = Date.now()
): Promise<LinkedInHeavySyncLock | null> {
  const stored = await chrome.storage.local.get(LINKEDIN_HEAVY_SYNC_LOCK_KEY);
  const lock = stored[LINKEDIN_HEAVY_SYNC_LOCK_KEY] as LinkedInHeavySyncLock | undefined;
  if (!lock || lock.version !== 1 || lock.owner !== 'connections_history_bootstrap') return null;
  if (lock.expiresAt <= now) {
    await chrome.storage.local.remove(LINKEDIN_HEAVY_SYNC_LOCK_KEY);
    return null;
  }
  return userId && lock.userId !== userId ? null : lock;
}

export async function acquireConnectionHistorySyncLock({
  userId,
  accountKey,
  now = Date.now(),
  ttlMs = LINKEDIN_HEAVY_SYNC_LOCK_TTL_MS,
}: {
  userId: string;
  accountKey: string;
  now?: number;
  ttlMs?: number;
}): Promise<LinkedInHeavySyncLock> {
  const existing = await getActiveLinkedInHeavySyncLock(userId, now);
  const lock: LinkedInHeavySyncLock = {
    version: 1,
    owner: 'connections_history_bootstrap',
    userId,
    accountKey,
    acquiredAt: existing?.accountKey === accountKey ? existing.acquiredAt : now,
    refreshedAt: now,
    expiresAt: now + Math.max(1_000, ttlMs),
  };
  await chrome.storage.local.set({ [LINKEDIN_HEAVY_SYNC_LOCK_KEY]: lock });
  return lock;
}

export async function releaseConnectionHistorySyncLock(userId: string, accountKey?: string): Promise<void> {
  const lock = await getActiveLinkedInHeavySyncLock(userId);
  if (!lock || (accountKey && lock.accountKey !== accountKey)) return;
  await chrome.storage.local.remove(LINKEDIN_HEAVY_SYNC_LOCK_KEY);
}
