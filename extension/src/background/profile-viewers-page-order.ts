import type { ProfileViewerInput } from 'shared/types';
import { parseProfileViewerRelativeAgeMs } from 'shared/profile-viewer-relative-time';

function normalizeSourceIndex(value: number | undefined): number {
  return Number.isSafeInteger(value) && value !== undefined && value >= 0 ? value : Number.MAX_SAFE_INTEGER;
}

/**
 * WVMP requests are time-descending, but references inside a streamed RSC
 * response are not guaranteed to appear in rendered-card order. Prefer the
 * card's own relative-view time and use source order only as a stable tie-break.
 */
export function orderProfileViewersPage(viewers: ProfileViewerInput[]): ProfileViewerInput[] {
  return [...viewers]
    .sort((left, right) => {
      const leftAge = parseProfileViewerRelativeAgeMs(left.viewedAgoText);
      const rightAge = parseProfileViewerRelativeAgeMs(right.viewedAgoText);
      if (leftAge !== null && rightAge !== null && leftAge !== rightAge) {
        return leftAge - rightAge;
      }

      return normalizeSourceIndex(left.sourceIndex) - normalizeSourceIndex(right.sourceIndex);
    })
    .map((viewer, listPosition) => ({
      ...viewer,
      listPosition,
    }));
}
