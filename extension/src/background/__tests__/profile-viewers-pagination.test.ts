import { describe, expect, it } from 'vitest';
import type { ProfileViewerInput } from 'shared/types';
import {
  createProfileViewersPaginationBody,
  createRecentProfileViewerSnapshot,
  extractNextProfileViewersPaginationCursor,
  extendBackfillRecentProfileViewerSnapshot,
  hasStableProfileViewerOverlap,
  PROFILE_VIEWERS_PAGER_ID,
  shouldStopIncrementalProfileViewerPagination,
} from '../profile-viewers-pagination';

function viewer(username: string): ProfileViewerInput {
  return {
    linkedinUrl: `https://www.linkedin.com/in/${username}/`,
    linkedinUsername: username,
    displayName: username,
  };
}

describe('profile viewers pagination', () => {
  it('extracts the next cursor embedded in a LinkedIn pagination response', () => {
    const payload =
      `2:T75e,{"$type":"proto.sdui.actions.requests.PaginationRequest",` +
      `"pagerId":"${PROFILE_VIEWERS_PAGER_ID}",` +
      `"requestedArguments":{"payload":{"start":50,"count":10,` +
      `"sortType":"ProfileViewSortType_TIME_DESCENDING","filterTypeList":[]}}}`;

    expect(extractNextProfileViewersPaginationCursor(payload)).toEqual({
      start: 50,
      count: 10,
    });
  });

  it('returns null when LinkedIn does not provide another pagination request', () => {
    expect(
      extractNextProfileViewersPaginationCursor(
        `${'x'.repeat(100)}"isPartialPage":true,"viewer-list-next-page-loaded"`
      )
    ).toBeNull();
  });

  it('builds the Premium WVMP request with date range states and the requested cursor', () => {
    const body = JSON.parse(
      createProfileViewersPaginationBody({ start: 30, count: 10 })
    ) as {
      pagerId: string;
      clientArguments: {
        payload: { start: number; count: number };
        states: Array<{ key: string; value: string[] }>;
        screenId: string;
      };
      paginationRequest: {
        requestedArguments: { payload: { start: number; count: number } };
      };
    };

    expect(body.pagerId).toBe(PROFILE_VIEWERS_PAGER_ID);
    expect(body.clientArguments.payload).toMatchObject({ start: 30, count: 10 });
    expect(body.paginationRequest.requestedArguments.payload).toMatchObject({
      start: 30,
      count: 10,
    });
    expect(body.clientArguments.screenId).toBe(
      'com.linkedin.sdui.flagshipnav.premium.wvmp.WVMP'
    );
    expect(body.clientArguments.states[0].value).toEqual([
      'WvmpSearchFilterTimeRange_LAST_90_DAYS',
    ]);
  });

  it('recognizes a stable ordered overlap with the previous recent snapshot', () => {
    expect(
      hasStableProfileViewerOverlap(
        ['new-a', 'new-b', 'known-1', 'known-2', 'known-3', 'known-4', 'known-5'],
        ['known-1', 'known-2', 'known-3', 'known-4', 'known-5', 'known-6']
      )
    ).toBe(true);
  });

  it('does not stop merely because one previously known viewer appears before new viewers', () => {
    const existingUsernames = new Set(['known-repeat', 'known-1', 'known-2']);
    const collected = [
      viewer('known-repeat'),
      viewer('new-a'),
      viewer('new-b'),
      viewer('known-1'),
      viewer('known-2'),
    ];

    expect(
      shouldStopIncrementalProfileViewerPagination(
        collected,
        collected,
        existingUsernames,
        ['known-repeat', 'known-1', 'known-2'],
        0
      )
    ).toBe(false);
  });

  it('stops after a no-new page reaches the stable previous snapshot', () => {
    const existingUsernames = new Set([
      'known-1',
      'known-2',
      'known-3',
      'known-4',
      'known-5',
    ]);
    const collected = [
      viewer('new-a'),
      viewer('known-1'),
      viewer('known-2'),
      viewer('known-3'),
      viewer('known-4'),
      viewer('known-5'),
    ];
    const currentPage = collected.slice(1);

    expect(
      shouldStopIncrementalProfileViewerPagination(
        collected,
        currentPage,
        existingUsernames,
        ['known-1', 'known-2', 'known-3', 'known-4', 'known-5'],
        1
      )
    ).toBe(true);
  });

  it('keeps a bounded unique recent snapshot with the latest usernames first', () => {
    expect(
      createRecentProfileViewerSnapshot(
        ['new-a', 'known-1', 'known-2'],
        ['known-1', 'known-2', 'known-3']
      )
    ).toEqual(['new-a', 'known-1', 'known-2', 'known-3']);
  });

  it('does not replace the top snapshot when a backfill resumes deep in history', () => {
    const currentSnapshot = ['top-1', 'top-2', 'top-3'];

    expect(
      extendBackfillRecentProfileViewerSnapshot(
        currentSnapshot,
        ['historical-100', 'historical-101'],
        100
      )
    ).toEqual(currentSnapshot);
  });
});
