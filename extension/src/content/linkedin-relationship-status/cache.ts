import { CACHE_TTL_MS } from './constants';
import type { CachedStatus, RelationshipStatus } from './types';

const statusCache = new Map<string, CachedStatus>();
const canonicalUsernameCache = new Map<string, string>();

function getStatusTtl(status: RelationshipStatus): number {
  return CACHE_TTL_MS[status];
}

export function getCachedStatus(username: string): CachedStatus | null {
  const key = username.toLowerCase();
  const cached = statusCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > getStatusTtl(cached.status)) {
    statusCache.delete(key);
    return null;
  }
  return cached;
}

export function cacheStatus(
  username: string,
  status: RelationshipStatus,
  profileUrn?: string,
  canMessage?: boolean,
  canFollow?: boolean,
  canConnect?: boolean,
  isFollowing?: boolean,
  memberNumericId?: string,
  isPremium?: boolean,
  profileImageUrl?: string
): void {
  statusCache.set(username.toLowerCase(), {
    status,
    profileUrn,
    canMessage: status === 'connected' ? true : canMessage,
    canFollow,
    canConnect,
    isFollowing,
    memberNumericId,
    isPremium,
    profileImageUrl,
    fetchedAt: Date.now(),
  });
}

export function clearStatusCache(): void {
  statusCache.clear();
  canonicalUsernameCache.clear();
}

export function invalidateCacheForUser(username: string): void {
  const key = username.toLowerCase();
  statusCache.delete(key);
  canonicalUsernameCache.delete(key);
}

export function getCachedCanonicalUsername(username: string): string | null {
  const cached = canonicalUsernameCache.get(username.toLowerCase());
  return cached || null;
}

export function cacheCanonicalUsername(sourceUsername: string, canonicalUsername: string): void {
  const normalizedSource = sourceUsername.trim().toLowerCase();
  const normalizedCanonical = canonicalUsername.trim().toLowerCase();
  if (!normalizedSource || !normalizedCanonical) {
    return;
  }

  canonicalUsernameCache.set(normalizedSource, normalizedCanonical);
  canonicalUsernameCache.set(normalizedCanonical, normalizedCanonical);
}
