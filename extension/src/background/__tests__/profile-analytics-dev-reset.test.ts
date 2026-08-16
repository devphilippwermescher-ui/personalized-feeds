import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedFeedsUser: vi.fn(),
  getDocs: vi.fn(),
  deleteDocument: vi.fn(),
  commitBatch: vi.fn(),
  clearAlarm: vi.fn(),
  removeStorage: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (...segments: unknown[]) => ({ segments }),
  getDocs: mocks.getDocs,
  writeBatch: () => ({
    delete: mocks.deleteDocument,
    commit: mocks.commitBatch,
  }),
}));
vi.mock('shared/firebase-config', () => ({
  getFirebaseDb: () => ({ id: 'test-db' }),
}));
vi.mock('../feeds-auth', () => ({
  getAuthenticatedFeedsUser: mocks.getAuthenticatedFeedsUser,
}));
vi.mock('../connection-invites-sync', () => ({
  CONNECTION_INVITES_STATUS_ALARM_NAME: 'connection-invites-alarm',
}));
vi.mock('../profile-analytics-sync-runtime', () => ({
  PROFILE_ANALYTICS_ALARM_NAME: 'profile-analytics-alarm',
}));

import { resetCurrentUserAnalyticsForDevelopment } from '../profile-analytics-dev-reset';

describe('Profile Analytics development reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('__MFP_DEV_BUILD__', true);
    vi.stubGlobal('chrome', {
      alarms: { clear: mocks.clearAlarm },
      storage: { local: { remove: mocks.removeStorage } },
    });
    mocks.getAuthenticatedFeedsUser.mockResolvedValue({ uid: 'test-user' });
    mocks.getDocs.mockImplementation(async (collectionReference: { segments: unknown[] }) => {
      const collectionName = String(collectionReference.segments[collectionReference.segments.length - 1]);
      const documentIds =
        collectionName === 'profileViewerMetadata' ? ['summary', 'profileAnalytics'] : [`${collectionName}-document`];
      return {
        docs: documentIds.map((id) => ({ id, ref: { id } })),
        size: documentIds.length,
      };
    });
    mocks.commitBatch.mockResolvedValue(undefined);
    mocks.clearAlarm.mockResolvedValue(true);
    mocks.removeStorage.mockResolvedValue(undefined);
  });

  it('deletes only analytics data for the current user and clears local scheduling state', async () => {
    const result = await resetCurrentUserAnalyticsForDevelopment();

    expect(result).toMatchObject({
      userId: 'test-user',
      deletedDocuments: 7,
      deletedByCollection: {
        profileAnalytics: 1,
        profileViewerMetadata: 1,
        connectionInvites: 1,
      },
    });
    expect(mocks.getDocs).toHaveBeenCalledTimes(7);
    expect(mocks.getDocs).toHaveBeenCalledWith({
      segments: [{ id: 'test-db' }, 'users', 'test-user', 'profileAnalytics'],
    });
    const queriedCollections = mocks.getDocs.mock.calls.map(
      ([collectionReference]) => collectionReference.segments[collectionReference.segments.length - 1]
    );
    expect(queriedCollections).not.toContain('profileViewers');
    expect(queriedCollections).not.toContain('profileViewerSearches');
    expect(mocks.deleteDocument).toHaveBeenCalledTimes(7);
    expect(mocks.deleteDocument).toHaveBeenCalledWith({ id: 'profileAnalytics' });
    expect(mocks.deleteDocument).not.toHaveBeenCalledWith({ id: 'summary' });
    expect(mocks.commitBatch).toHaveBeenCalledOnce();
    expect(mocks.clearAlarm).toHaveBeenCalledTimes(2);
    const removedStorageKeys = mocks.removeStorage.mock.calls[0]?.[0] as string[];
    expect(removedStorageKeys).toContain('mfp_profile_analytics_sync_v6');
    expect(removedStorageKeys).not.toContain('pf_profile_viewers_sync');
    expect(removedStorageKeys).not.toContain('lfs_profile_viewers_status_sync_state_v1');
  });

  it('refuses to delete anything in a production extension build', async () => {
    vi.stubGlobal('__MFP_DEV_BUILD__', false);

    await expect(resetCurrentUserAnalyticsForDevelopment()).rejects.toThrow(
      'Analytics reset is available only in a development extension build.'
    );
    expect(mocks.getAuthenticatedFeedsUser).not.toHaveBeenCalled();
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });
});
