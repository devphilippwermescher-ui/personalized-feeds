import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../shared/firestore/refs', () => ({
  profileAnalyticsHistoryJobDoc: vi.fn(),
  profileAnalyticsHistoryChunkDoc: vi.fn(),
  profileAnalyticsHistoryChunksCollection: vi.fn(),
}));

import { toProfileAnalyticsConnectionHistoryJobData } from 'shared/firestore/profile-analytics-history';

describe('Profile Analytics history job persistence', () => {
  it('converts undefined job fields to Firestore delete sentinels', () => {
    const data = toProfileAnalyticsConnectionHistoryJobData({
      version: 2,
      accountKey: 'profile:example',
      status: 'running',
      restartCount: 0,
      batchIndex: 0,
      nextRetryAt: undefined,
      error: undefined,
      updatedAt: 100,
    });

    expect(data.status).toBe('running');
    expect(data.nextRetryAt).toBeDefined();
    expect(data.error).toBeDefined();
    expect(Object.values(data)).not.toContain(undefined);
  });
});
