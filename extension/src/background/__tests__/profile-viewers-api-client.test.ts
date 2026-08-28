import { describe, expect, it } from 'vitest';
import { resolveNextProfileViewersPaginationCursor } from '../profile-viewers-api-client';

describe('Profile Visitors API pagination', () => {
  it('uses LinkedIn pagination state without classifying the LinkedIn account plan', () => {
    expect(
      resolveNextProfileViewersPaginationCursor({
        parsedNextCursor: null,
        paginationNeeded: true,
        allowInitialPaginationProbe: true,
        hasVisibleViewers: true,
      })
    ).toEqual({ start: 10, count: 10 });
  });

  it('does not invent a next page when LinkedIn says pagination is complete', () => {
    expect(
      resolveNextProfileViewersPaginationCursor({
        parsedNextCursor: null,
        requestedCursor: { start: 20, count: 10 },
        paginationNeeded: false,
        allowInitialPaginationProbe: false,
        hasVisibleViewers: true,
      })
    ).toBeNull();
  });

  it('advances LinkedIn pagination cursors by the requested page size', () => {
    expect(
      resolveNextProfileViewersPaginationCursor({
        parsedNextCursor: null,
        requestedCursor: { start: 20, count: 10 },
        paginationNeeded: true,
        allowInitialPaginationProbe: false,
        hasVisibleViewers: true,
      })
    ).toEqual({ start: 30, count: 10 });
  });
});
