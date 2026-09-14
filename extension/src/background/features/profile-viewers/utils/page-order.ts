import type { ProfileViewerInput } from 'shared/types';

function normalizeSourceIndex(value: number | undefined): number {
  return Number.isSafeInteger(value) && value !== undefined && value >= 0
    ? value
    : Number.MAX_SAFE_INTEGER;
}

/**
 * SemanticPosition is LinkedIn's authoritative card order. When it is absent,
 * sourceIndex is the order in which card contexts were reached from the
 * rendered React Flight root. Coarse relative times are intentionally not a
 * sorting input because many adjacent cards share values such as "1mo ago".
 */
export function orderProfileViewersPage(viewers: ProfileViewerInput[]): ProfileViewerInput[] {
  return [...viewers]
    .sort((left, right) => {
      const leftRenderPosition = normalizeSourceIndex(left.renderPosition);
      const rightRenderPosition = normalizeSourceIndex(right.renderPosition);
      if (
        leftRenderPosition !== Number.MAX_SAFE_INTEGER &&
        rightRenderPosition !== Number.MAX_SAFE_INTEGER &&
        leftRenderPosition !== rightRenderPosition
      ) {
        return leftRenderPosition - rightRenderPosition;
      }

      return normalizeSourceIndex(left.sourceIndex) - normalizeSourceIndex(right.sourceIndex);
    })
    .map((viewer, listPosition) => ({ ...viewer, listPosition }));
}
