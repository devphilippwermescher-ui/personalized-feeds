import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardAnalyticsPublishInput } from '../dashboard-analytics-manifest';

const callOrder: string[] = [];

// `vi.hoisted` keeps these usable inside the hoisted `vi.mock` factories below.
const mocks = vi.hoisted(() => ({
  getAuthenticatedFeedsUser: vi.fn(),
  getActiveLinkedInHeavySyncLock: vi.fn(),
  getProfileAnalyticsSnapshot: vi.fn(),
  migrateLegacyProfileAnalyticsStorage: vi.fn(),
  runContentAnalyticsRangeTask: vi.fn(),
  runConnectionHistoryTask: vi.fn(),
  resolveConnectionHistoryJob: vi.fn(),
  runContentAnalyticsPostEnrichmentTask: vi.fn(),
  publishDashboardAnalyticsRun: vi.fn(),
  publishContentAnalyticsPosts: vi.fn(),
  scheduleDashboardAnalyticsAlarm: vi.fn(),
  setStoredDashboardAnalyticsSyncState: vi.fn(),
  loadDashboardAnalyticsSyncState: vi.fn(),
  getProfileViewersSyncState: vi.fn(),
  runProfileAnalyticsBootstrapTask: vi.fn(),
  runProfileAnalyticsMetadataTask: vi.fn(),
  runProfileAnalyticsNetworkTask: vi.fn(),
  runDueAcceptanceTask: vi.fn(),
  runSearchAppearancesTask: vi.fn(),
  runSocialSellingIndexTask: vi.fn(),
}));

const {
  getAuthenticatedFeedsUser,
  getActiveLinkedInHeavySyncLock,
  getProfileAnalyticsSnapshot,
  runContentAnalyticsRangeTask,
  runConnectionHistoryTask,
  resolveConnectionHistoryJob,
  runContentAnalyticsPostEnrichmentTask,
  publishDashboardAnalyticsRun,
  publishContentAnalyticsPosts,
} = mocks;

/** Records the order the fast Profile metrics ran in. */
function stubProfileTask(mock: ReturnType<typeof vi.fn>, name: string, metrics: string[] = []) {
  mock.mockImplementation(async ({ state, snapshot }: { state: unknown; snapshot: unknown }) => {
    callOrder.push(name);
    return { state, snapshot, currentSynced: metrics.length > 0, metrics };
  });
}

vi.mock('shared/firestore-service', () => ({
  CONNECTION_INVITE_FIRST_CHECK_DELAY_MS: 60_000,
  getProfileAnalyticsSnapshot: mocks.getProfileAnalyticsSnapshot,
  migrateLegacyProfileAnalyticsStorage: mocks.migrateLegacyProfileAnalyticsStorage,
}));
vi.mock('../../feeds-auth', () => ({ getAuthenticatedFeedsUser: mocks.getAuthenticatedFeedsUser }));
vi.mock('../../linkedin-heavy-sync-lock', () => ({
  getActiveLinkedInHeavySyncLock: mocks.getActiveLinkedInHeavySyncLock,
}));
vi.mock('../../linkedin-tab-selection', () => ({
  selectLinkedInExecutionTabs: (tabs: Array<{ id: number }>) => tabs,
}));
vi.mock('../../profile-analytics-bootstrap-task', () => ({
  runProfileAnalyticsBootstrapTask: mocks.runProfileAnalyticsBootstrapTask,
}));
vi.mock('../../profile-analytics-metadata-task', () => ({
  runProfileAnalyticsMetadataTask: mocks.runProfileAnalyticsMetadataTask,
}));
vi.mock('../../profile-analytics-network-task', () => ({
  runProfileAnalyticsNetworkTask: mocks.runProfileAnalyticsNetworkTask,
}));
vi.mock('../../profile-analytics-acceptance-task', () => ({ runDueAcceptanceTask: mocks.runDueAcceptanceTask }));
vi.mock('../../profile-analytics-daily-sync-tasks', () => ({
  runSearchAppearancesTask: mocks.runSearchAppearancesTask,
  runSocialSellingIndexTask: mocks.runSocialSellingIndexTask,
}));
vi.mock('../../profile-analytics-history-task', () => ({
  runConnectionHistoryTask: mocks.runConnectionHistoryTask,
}));
vi.mock('../../profile-analytics-history-request-result', () => ({
  getProfileAnalyticsHistoryRequestResult: () => null,
}));
vi.mock('../../profile-viewers-coordinator-storage', () => ({
  getProfileViewersSyncState: mocks.getProfileViewersSyncState,
}));
vi.mock('../../profile-viewers-sync-state', () => ({ isProfileViewersFirstSurfaceReady: () => true }));
vi.mock('../connection-history-bootstrap-gate', () => ({
  resolveConnectionHistoryJob: mocks.resolveConnectionHistoryJob,
}));
vi.mock('../content-analytics-sync-task', () => ({
  runContentAnalyticsRangeTask: mocks.runContentAnalyticsRangeTask,
}));
vi.mock('../content-analytics-post-enrichment-task', () => ({
  runContentAnalyticsPostEnrichmentTask: mocks.runContentAnalyticsPostEnrichmentTask,
}));
// Fully mocked: the real publisher pulls in the Firebase app at module scope.
vi.mock('../dashboard-analytics-publisher', () => ({
  publishDashboardAnalyticsRun: mocks.publishDashboardAnalyticsRun,
  publishContentAnalyticsPosts: mocks.publishContentAnalyticsPosts,
}));
vi.mock('../dashboard-analytics-sync-runtime', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  scheduleDashboardAnalyticsAlarm: mocks.scheduleDashboardAnalyticsAlarm,
}));
vi.mock('../dashboard-analytics-sync-storage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  setStoredDashboardAnalyticsSyncState: mocks.setStoredDashboardAnalyticsSyncState,
  loadDashboardAnalyticsSyncState: mocks.loadDashboardAnalyticsSyncState,
}));

import { queueDashboardAnalyticsSync } from '../dashboard-analytics-sync-coordinator';

const profileSnapshot = {
  updatedAt: 1_800_000_000_000,
  profile: {
    linkedinUsername: 'example',
    linkedinUrl: 'https://www.linkedin.com/in/example',
    profileUrn: 'urn:li:fsd_profile:ACoAA-example',
    updatedAt: 1_800_000_000_000,
    sourceUrl: 'https://www.linkedin.com/voyager/api/me',
  },
};

const contentRange = {
  id: '30d',
  rangeKey: '30d' as const,
  startDate: '2026-07-24',
  endDate: '2026-08-22',
  timezone: 'UTC' as const,
  metrics: { impressions: 1800, posts: 17 },
  coverage: { impressions: 'exact' as const },
  syncRunId: 'run',
  capturedAt: 1_800_000_000_000,
  publishedAt: 1_800_000_000_000,
  sourceUrl: 'https://www.linkedin.com/flagship-web/analytics/creator/content/',
};

function contentResult() {
  return { rangeKey: '30d' as const, range: contentRange, daily: [], posts: [], postsTruncated: false };
}

beforeEach(() => {
  callOrder.length = 0;
  vi.clearAllMocks();
  stubProfileTask(mocks.runProfileAnalyticsBootstrapTask, 'profile:bootstrap');
  stubProfileTask(mocks.runProfileAnalyticsMetadataTask, 'profile:metadata', ['profileMetadata']);
  stubProfileTask(mocks.runProfileAnalyticsNetworkTask, 'profile:network', ['connections', 'followers']);
  stubProfileTask(mocks.runDueAcceptanceTask, 'profile:acceptance');
  stubProfileTask(mocks.runSearchAppearancesTask, 'profile:search');
  stubProfileTask(mocks.runSocialSellingIndexTask, 'profile:ssi');
  mocks.migrateLegacyProfileAnalyticsStorage.mockResolvedValue(undefined);
  mocks.getProfileViewersSyncState.mockResolvedValue({});
  mocks.scheduleDashboardAnalyticsAlarm.mockResolvedValue(undefined);
  mocks.setStoredDashboardAnalyticsSyncState.mockResolvedValue(undefined);
  mocks.loadDashboardAnalyticsSyncState.mockImplementation(async (userId: string) => ({
    version: 3 as const,
    userId,
    status: { status: 'idle' as const, metrics: {} },
    logs: [],
    content: { version: 1 as const, ranges: {}, postEnrichment: { enrichedAt: {} } },
  }));
  Object.assign(globalThis, {
    chrome: {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://www.linkedin.com/feed/' }]) },
      alarms: { create: vi.fn().mockResolvedValue(undefined) },
      storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
    },
  });
  getAuthenticatedFeedsUser.mockResolvedValue({ uid: 'user-1' });
  getProfileAnalyticsSnapshot.mockResolvedValue(profileSnapshot);
  getActiveLinkedInHeavySyncLock.mockResolvedValue(null);
  resolveConnectionHistoryJob.mockResolvedValue({ job: null, created: false });
  runContentAnalyticsRangeTask.mockImplementation(async () => {
    callOrder.push('content:core');
    return contentResult();
  });
  publishDashboardAnalyticsRun.mockImplementation(async () => {
    callOrder.push('publish');
  });
  publishContentAnalyticsPosts.mockResolvedValue(undefined);
  runContentAnalyticsPostEnrichmentTask.mockImplementation(async () => {
    callOrder.push('content:enrichment');
    return { posts: [], enrichment: { enrichedAt: {} }, attempted: 0, succeeded: 0 };
  });
});

describe('Dashboard Analytics sync ordering', () => {
  it('runs the fast Profile core, then the fast Content core, then publishes once', async () => {
    await queueDashboardAnalyticsSync('alarm');

    expect(callOrder.indexOf('profile:network')).toBeLessThan(callOrder.indexOf('content:core'));
    expect(callOrder.indexOf('content:core')).toBeLessThan(callOrder.indexOf('publish'));
  });

  it('runs both fast cores even while the connection-history heavy lock is held', async () => {
    getActiveLinkedInHeavySyncLock.mockResolvedValue({
      version: 1,
      owner: 'connections_history_bootstrap',
      userId: 'user-1',
      accountKey: 'urn:li:fsd_profile:ACoAA-example',
      acquiredAt: 1,
      refreshedAt: 1,
      expiresAt: Date.now() + 60_000,
    });

    const result = await queueDashboardAnalyticsSync('alarm');

    expect(callOrder).toContain('profile:network');
    expect(callOrder).toContain('content:core');
    expect(callOrder).toContain('publish');
    expect(result.contentSynced).toBe(true);
    // Heavy work still yields to the lock.
    expect(callOrder).not.toContain('content:enrichment');
  });

  it('does not block Content Analytics while first-profile data is still unavailable', async () => {
    getProfileAnalyticsSnapshot.mockResolvedValue(null);

    await queueDashboardAnalyticsSync('dashboard_open');

    expect(runContentAnalyticsRangeTask).toHaveBeenCalled();
    expect(publishDashboardAnalyticsRun).toHaveBeenCalled();
  });

  it('publishes Profile and Content under one sync run id', async () => {
    await queueDashboardAnalyticsSync('alarm');

    const input = publishDashboardAnalyticsRun.mock.calls[0][0] as DashboardAnalyticsPublishInput;
    expect(input.syncRunId).toMatch(/\w+_\w+/);
    expect(input.profile.status).toBe('success');
    expect(input.content.status).toBe('success');
    expect(input.publishedAt).toBeGreaterThanOrEqual(input.startedAt);
  });

  it('still publishes the Profile core when the Content core fails', async () => {
    runContentAnalyticsRangeTask.mockRejectedValue(new Error('LinkedIn request was blocked with 999'));

    const result = await queueDashboardAnalyticsSync('alarm');
    const input = publishDashboardAnalyticsRun.mock.calls[0][0] as DashboardAnalyticsPublishInput;

    expect(input.profile.status).toBe('success');
    expect(input.content.status).toBe('blocked');
    // A failed source contributes no documents, so saved values survive.
    expect(input.ranges).toEqual([]);
    expect(input.currentRange).toBeUndefined();
    expect(result.contentSynced).toBe(false);
  });

  it('continues an existing history job but never creates one on an alarm', async () => {
    resolveConnectionHistoryJob.mockResolvedValue({
      job: { id: 'job-1', accountKey: 'urn:li:fsd_profile:ACoAA-example', status: 'scheduled' },
      created: false,
    });
    runConnectionHistoryTask.mockImplementation(
      async ({ state, snapshot }: { state: unknown; snapshot: unknown }) => {
        callOrder.push('history:batch');
        return { state, snapshot, historySynced: false };
      }
    );

    await queueDashboardAnalyticsSync('alarm');

    expect(resolveConnectionHistoryJob).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'alarm' }));
    expect(callOrder.indexOf('publish')).toBeLessThan(callOrder.indexOf('history:batch'));
  });

  it('skips the history batch entirely when no job exists', async () => {
    await queueDashboardAnalyticsSync('alarm');

    expect(runConnectionHistoryTask).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent runs into one active sync', async () => {
    const first = queueDashboardAnalyticsSync('alarm');
    const second = queueDashboardAnalyticsSync('alarm');

    expect(second).toBe(first);
    await first;
    expect(publishDashboardAnalyticsRun).toHaveBeenCalledTimes(1);
  });

  it('reports no_auth without touching LinkedIn when nobody is signed in', async () => {
    getAuthenticatedFeedsUser.mockResolvedValue(null);

    const result = await queueDashboardAnalyticsSync('alarm');

    expect(result.reason).toBe('no_auth');
    expect(runContentAnalyticsRangeTask).not.toHaveBeenCalled();
    expect(publishDashboardAnalyticsRun).not.toHaveBeenCalled();
  });
});
