import type { User } from 'firebase/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfileViewersSyncState } from '../profile-viewers-sync-state';

const mocks = vi.hoisted(() => ({
  fetchProfileViewersPaginationPage: vi.fn(),
  getLinkedInCsrfToken: vi.fn(),
  updateProfileViewerSummary: vi.fn(),
}));

vi.mock('../profile-viewers-api-client', () => ({
  fetchProfileViewersPaginationPage: mocks.fetchProfileViewersPaginationPage,
  getLinkedInCsrfToken: mocks.getLinkedInCsrfToken,
}));

vi.mock('shared/firestore-service', () => ({
  updateProfileViewerSummary: mocks.updateProfileViewerSummary,
}));

import { syncPrivateProfileViewerSummaryViaApi } from '../profile-viewers-private-summary-sync';

function page(overrides: Record<string, unknown> = {}) {
  return {
    viewers: [],
    searches: [],
    privateViewerCount: null,
    recruiterViewerCount: null,
    recruiterViewerUrl: null,
    httpStatus: 200,
    responseLength: 1000,
    nextCursor: null,
    ...overrides,
  };
}

describe('private profile viewer summary sync', () => {
  const user = { uid: 'user-1' } as User;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLinkedInCsrfToken.mockResolvedValue('csrf');
    mocks.updateProfileViewerSummary.mockResolvedValue(undefined);
  });

  it('saves the count and remembers the page where LinkedIn exposed it', async () => {
    const state = {
      ...createProfileViewersSyncState(user.uid, 1),
      backfillStatus: 'complete' as const,
      privateSummaryStatus: 'scanning' as const,
      privateSummaryNextStart: 40,
      privateSummaryPageSize: 10,
    };
    mocks.fetchProfileViewersPaginationPage.mockResolvedValue(page({ privateViewerCount: 32 }));
    const persist = vi.fn().mockResolvedValue(undefined);

    const result = await syncPrivateProfileViewerSummaryViaApi(user, state, persist);

    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenCalledWith({ start: 40, count: 10 }, 'csrf');
    expect(mocks.updateProfileViewerSummary).toHaveBeenCalledWith(
      user.uid,
      expect.objectContaining({ privateViewerCount: 32 }),
      expect.any(Number)
    );
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        nextCollectionTask: 'visible',
        privateSummaryStatus: 'ready',
        privateSummaryKnownStart: 40,
        privateSummaryNextStart: undefined,
      })
    );
    expect(result).toMatchObject({
      collectionTask: 'private_summary',
      privateViewerCount: 32,
      privateViewerCountStart: 40,
    });
  });

  it('prefers the known position over a stale full-scan checkpoint', async () => {
    const state = {
      ...createProfileViewersSyncState(user.uid, 1),
      backfillStatus: 'complete' as const,
      privateSummaryStatus: 'scanning' as const,
      privateSummaryNextStart: 10,
      privateSummaryKnownStart: 70,
      privateSummaryPageSize: 10,
      privateSummaryScanOrigin: 'full' as const,
    };
    mocks.fetchProfileViewersPaginationPage.mockResolvedValue(
      page({ privateViewerCount: 32 })
    );
    const persist = vi.fn().mockResolvedValue(undefined);

    const result = await syncPrivateProfileViewerSummaryViaApi(user, state, persist);

    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenCalledWith(
      { start: 70, count: 10 },
      'csrf'
    );
    expect(result).toMatchObject({
      privateViewerCount: 32,
      pagesFetched: 1,
      requestCount: 1,
    });
  });

  it('continues forward from the known position before considering a full rescan', async () => {
    const state = {
      ...createProfileViewersSyncState(user.uid, 1),
      backfillStatus: 'complete' as const,
      privateSummaryStatus: 'ready' as const,
      privateSummaryKnownStart: 70,
      privateSummaryPageSize: 10,
    };
    mocks.fetchProfileViewersPaginationPage
      .mockResolvedValueOnce(
        page({ nextCursor: { start: 80, count: 10 } })
      )
      .mockResolvedValueOnce(page({ privateViewerCount: 32 }));
    const persist = vi.fn().mockResolvedValue(undefined);

    const result = await syncPrivateProfileViewerSummaryViaApi(
      user,
      state,
      persist
    );

    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenNthCalledWith(
      1,
      { start: 70, count: 10 },
      'csrf'
    );
    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenNthCalledWith(
      2,
      { start: 80, count: 10 },
      'csrf'
    );
    expect(result).toMatchObject({
      privateViewerCount: 32,
      privateViewerCountStart: 80,
      pagesFetched: 2,
    });
    expect(persist).toHaveBeenLastCalledWith(
      expect.objectContaining({
        privateSummaryStatus: 'ready',
        privateSummaryKnownStart: 80,
        privateSummaryNextStart: undefined,
      })
    );
  });

  it('continues through pagination in the same run until the private count is found', async () => {
    const state = {
      ...createProfileViewersSyncState(user.uid, 1),
      backfillStatus: 'complete' as const,
      privateSummaryStatus: 'scanning' as const,
      privateSummaryNextStart: 20,
      privateSummaryPageSize: 10,
      privateSummaryScanOrigin: 'full' as const,
    };
    mocks.fetchProfileViewersPaginationPage
      .mockResolvedValueOnce(page({ responseLength: 1000, nextCursor: { start: 30, count: 10 } }))
      .mockResolvedValueOnce(page({ responseLength: 1200, privateViewerCount: 32 }));
    const persist = vi.fn().mockResolvedValue(undefined);

    const result = await syncPrivateProfileViewerSummaryViaApi(user, state, persist);

    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenNthCalledWith(1, { start: 20, count: 10 }, 'csrf');
    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenNthCalledWith(2, { start: 30, count: 10 }, 'csrf');
    expect(persist).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        nextCollectionTask: 'private_summary',
        privateSummaryStatus: 'scanning',
        privateSummaryNextStart: 30,
        privateSummaryScanOrigin: 'full',
      })
    );
    expect(persist).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nextCollectionTask: 'visible',
        privateSummaryStatus: 'ready',
        privateSummaryKnownStart: 30,
      })
    );
    expect(result).toMatchObject({
      privateViewerCount: 32,
      pagesFetched: 2,
      requestCount: 2,
      responseLength: 2200,
      paginationComplete: true,
    });
  });

  it('restarts from the beginning when the remembered summary position becomes invalid', async () => {
    const state = {
      ...createProfileViewersSyncState(user.uid, 1),
      backfillStatus: 'complete' as const,
      privateSummaryStatus: 'ready' as const,
      privateSummaryKnownStart: 50,
      privateSummaryPageSize: 10,
    };
    mocks.fetchProfileViewersPaginationPage
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page({ privateViewerCount: 31 }));
    const persist = vi.fn().mockResolvedValue(undefined);

    const result = await syncPrivateProfileViewerSummaryViaApi(user, state, persist);

    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenNthCalledWith(1, { start: 50, count: 10 }, 'csrf');
    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenNthCalledWith(2, { start: 10, count: 10 }, 'csrf');
    expect(persist).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        nextCollectionTask: 'private_summary',
        privateSummaryStatus: 'scanning',
        privateSummaryNextStart: 10,
        privateSummaryKnownStart: undefined,
        privateSummaryScanOrigin: 'full',
      })
    );
    expect(result).toMatchObject({
      privateViewerCount: 31,
      privateViewerCountStart: 10,
      pagesFetched: 2,
    });
  });

  it('writes zero only after a full scan reaches LinkedIn end naturally', async () => {
    const state = {
      ...createProfileViewersSyncState(user.uid, 1),
      backfillStatus: 'complete' as const,
      privateSummaryStatus: 'scanning' as const,
      privateSummaryNextStart: 70,
      privateSummaryPageSize: 10,
      privateSummaryScanOrigin: 'full' as const,
    };
    mocks.fetchProfileViewersPaginationPage.mockResolvedValue(page());
    const persist = vi.fn().mockResolvedValue(undefined);

    const result = await syncPrivateProfileViewerSummaryViaApi(user, state, persist);

    expect(mocks.updateProfileViewerSummary).toHaveBeenCalledWith(
      user.uid,
      expect.objectContaining({ privateViewerCount: 0 }),
      expect.any(Number)
    );
    expect(result.privateViewerCount).toBe(0);
  });

  it('keeps the checkpoint without fetching another page when the shared request budget is exhausted', async () => {
    const state = {
      ...createProfileViewersSyncState(user.uid, Date.now()),
      backfillStatus: 'complete' as const,
      requestBudgetTokens: 0,
      requestBudgetUpdatedAt: Date.now(),
      privateSummaryStatus: 'scanning' as const,
      privateSummaryNextStart: 20,
      privateSummaryPageSize: 10,
      privateSummaryScanOrigin: 'full' as const,
    };
    mocks.fetchProfileViewersPaginationPage.mockResolvedValue(
      page({ nextCursor: { start: 30, count: 10 } })
    );
    const persist = vi.fn().mockResolvedValue(undefined);

    const result = await syncPrivateProfileViewerSummaryViaApi(user, state, persist);

    expect(mocks.fetchProfileViewersPaginationPage).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nextCollectionTask: 'private_summary',
        privateSummaryNextStart: 30,
      })
    );
    expect(result).toMatchObject({
      pagesFetched: 1,
      paginationComplete: false,
    });
  });
});
