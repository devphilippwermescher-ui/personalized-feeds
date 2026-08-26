import type { ProfileViewerListItem } from './types';
import { getEstimatedProfileViewedAt } from './profile-viewer-relative-time';

function normalizePosition(position: number | undefined): number {
  return Number.isInteger(position) && position !== undefined && position >= 0 ? position : Number.MAX_SAFE_INTEGER;
}

export function sortProfileViewersByRecency<T extends ProfileViewerListItem>(viewers: T[]): T[] {
  return [...viewers].sort((left, right) => {
    const leftViewedAt = getEstimatedProfileViewedAt(left.viewedAgoText, left.lastSeenAt);
    const rightViewedAt = getEstimatedProfileViewedAt(right.viewedAgoText, right.lastSeenAt);
    if (leftViewedAt !== null && rightViewedAt !== null) {
      const viewedAtDifference = rightViewedAt - leftViewedAt;
      if (viewedAtDifference !== 0) {
        return viewedAtDifference;
      }
    }

    const lastSeenDifference = right.lastSeenAt - left.lastSeenAt;
    if (lastSeenDifference !== 0) {
      return lastSeenDifference;
    }

    const positionDifference = normalizePosition(left.lastSeenPosition) - normalizePosition(right.lastSeenPosition);
    if (positionDifference !== 0) {
      return positionDifference;
    }

    const firstSeenDifference = right.firstSeenAt - left.firstSeenAt;
    if (firstSeenDifference !== 0) {
      return firstSeenDifference;
    }

    return left.id.localeCompare(right.id);
  });
}
