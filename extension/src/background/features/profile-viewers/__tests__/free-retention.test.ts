import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileViewer } from 'shared/types';

const mocks = vi.hoisted(() => ({
  batchCommit: vi.fn(),
  batchDelete: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_collection, id: string) => ({ id })),
  getDocs: mocks.getDocs,
  orderBy: vi.fn(),
  query: vi.fn((collection) => collection),
  writeBatch: vi.fn(() => ({
    commit: mocks.batchCommit,
    delete: mocks.batchDelete,
  })),
}));

vi.mock('shared/firebase-config', () => ({
  getFirebaseDb: vi.fn(() => ({})),
}));

vi.mock('shared/firestore/refs', () => ({
  docToProfileViewer: vi.fn((snapshot: { data: () => ProfileViewer }) => snapshot.data()),
  docToProfileViewerSearch: vi.fn(),
  profileViewerSearchesCollection: vi.fn(),
  profileViewerSummaryDoc: vi.fn(),
  profileViewersCollection: vi.fn(() => ({ path: 'profileViewers' })),
}));

import { pruneFreeCollectedProfileViewers } from 'shared/firestore/profile-viewers';

function viewer(
  linkedinUsername: string,
  lastSeenAt: number,
  collectedPlan: ProfileViewer['collectedPlan'] | null = 'free'
): ProfileViewer {
  return {
    id: linkedinUsername,
    linkedinUrl: `https://www.linkedin.com/in/${linkedinUsername}/`,
    linkedinUsername,
    displayName: linkedinUsername,
    firstSeenAt: lastSeenAt,
    lastSeenAt,
    source: 'linkedin_profile_views',
    ...(collectedPlan ? { collectedPlan } : {}),
  };
}

function snapshot(viewers: ProfileViewer[]) {
  return {
    docs: viewers.map((item) => ({
      data: () => item,
      ref: { id: item.id },
    })),
  };
}

describe('Free Profile Visitors retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batchCommit.mockResolvedValue(undefined);
  });

  it('keeps collected history when the stored total remains below the limit', async () => {
    mocks.getDocs.mockResolvedValue(
      snapshot([viewer('current-viewer-a', 30), viewer('current-viewer-b', 20), viewer('historical-ludmila', 10)])
    );

    await expect(pruneFreeCollectedProfileViewers('user-1', 10)).resolves.toBe(0);

    expect(mocks.batchDelete).not.toHaveBeenCalled();
    expect(mocks.batchCommit).not.toHaveBeenCalled();
  });

  it('deletes only the oldest Free profile when an eleventh profile is collected', async () => {
    const freeViewers = Array.from({ length: 11 }, (_, index) => viewer(`viewer-${index + 1}`, 110 - index * 10));
    mocks.getDocs.mockResolvedValue(
      snapshot([...freeViewers, viewer('legacy-viewer', 1, null), viewer('pro-viewer', 0, 'pro')])
    );

    await expect(pruneFreeCollectedProfileViewers('user-1', 10)).resolves.toBe(1);

    expect(mocks.batchDelete).toHaveBeenCalledTimes(1);
    expect(mocks.batchDelete).toHaveBeenCalledWith({ id: 'viewer-11' });
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1);
  });
});
