import { normalizeLinkedInUsername } from 'shared/linkedin-identity';
import type { ProfileViewer } from 'shared/types';

export const PROFILE_VIEWERS_STATUS_STALE_MS = 60 * 60 * 1000;
export const PROFILE_VIEWERS_STATUS_BATCH_LIMIT = 20;

function normalizePriorityUsernames(usernames: string[] = []): string[] {
  return Array.from(
    new Set(
      usernames
        .map((username) => normalizeLinkedInUsername(username))
        .filter(Boolean)
    )
  );
}

function isStatusStale(viewer: ProfileViewer, now: number): boolean {
  if (!normalizeLinkedInUsername(viewer.linkedinUsername || viewer.id)) {
    return false;
  }

  if (viewer.statusCheckFailedAt && now - viewer.statusCheckFailedAt < PROFILE_VIEWERS_STATUS_STALE_MS) {
    return false;
  }

  return (
    !viewer.status ||
    viewer.status === 'loading' ||
    typeof viewer.statusResolvedAt !== 'number' ||
    now - viewer.statusResolvedAt >= PROFILE_VIEWERS_STATUS_STALE_MS
  );
}

export function selectProfileViewersForStatusSync(
  viewers: ProfileViewer[],
  priorityUsernames: string[] = [],
  now = Date.now(),
  limit = PROFILE_VIEWERS_STATUS_BATCH_LIMIT
): ProfileViewer[] {
  const priorityIndex = new Map(
    normalizePriorityUsernames(priorityUsernames).map((username, index) => [username, index])
  );

  return viewers
    .filter((viewer) => isStatusStale(viewer, now))
    .sort((left, right) => {
      const leftUsername = normalizeLinkedInUsername(left.linkedinUsername || left.id);
      const rightUsername = normalizeLinkedInUsername(right.linkedinUsername || right.id);
      const leftPriority = priorityIndex.has(leftUsername)
        ? priorityIndex.get(leftUsername) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;
      const rightPriority = priorityIndex.has(rightUsername)
        ? priorityIndex.get(rightUsername) ?? Number.MAX_SAFE_INTEGER
        : Number.MAX_SAFE_INTEGER;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftHasStatus = left.status && left.status !== 'loading';
      const rightHasStatus = right.status && right.status !== 'loading';
      if (leftHasStatus !== rightHasStatus) {
        return leftHasStatus ? 1 : -1;
      }

      const leftResolvedAt = typeof left.statusResolvedAt === 'number' ? left.statusResolvedAt : 0;
      const rightResolvedAt = typeof right.statusResolvedAt === 'number' ? right.statusResolvedAt : 0;
      if (leftResolvedAt !== rightResolvedAt) {
        return leftResolvedAt - rightResolvedAt;
      }

      return (right.lastSeenAt || 0) - (left.lastSeenAt || 0);
    })
    .slice(0, limit);
}
