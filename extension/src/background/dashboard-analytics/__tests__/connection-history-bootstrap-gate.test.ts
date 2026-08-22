import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProfileAnalyticsConnectionHistoryJob = vi.fn();
const ensureConnectionHistoryBootstrapJob = vi.fn();

vi.mock('shared/firestore-service', () => ({
  getProfileAnalyticsConnectionAccountKey: (profile: {
    profileUrn?: string;
    memberNumericId?: string;
    linkedinUsername: string;
  }) => profile.profileUrn || profile.memberNumericId || profile.linkedinUsername.trim().toLowerCase(),
  getProfileAnalyticsConnectionHistoryJob: (...args: unknown[]) =>
    getProfileAnalyticsConnectionHistoryJob(...args),
}));

vi.mock('../../profile-analytics-history-sync', () => ({
  ensureConnectionHistoryBootstrapJob: (...args: unknown[]) => ensureConnectionHistoryBootstrapJob(...args),
}));

import {
  resolveConnectionHistoryJob,
  shouldCreateConnectionHistoryBootstrap,
} from '../connection-history-bootstrap-gate';
import type { DashboardAnalyticsSyncTrigger } from '../dashboard-analytics-sync-policy';
import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';

const profile: ProfileAnalyticsProfileSnapshot = {
  linkedinUsername: 'example',
  linkedinUrl: 'https://www.linkedin.com/in/example',
  profileUrn: 'urn:li:fsd_profile:ACoAA-example',
  updatedAt: 1,
  sourceUrl: 'https://www.linkedin.com/voyager/api/me',
} as ProfileAnalyticsProfileSnapshot;

const ROUTINE_TRIGGERS: DashboardAnalyticsSyncTrigger[] = [
  'install',
  'update',
  'chrome_startup',
  'service_worker',
  'alarm',
  'linkedin_open',
  'linkedin_activity',
  'dashboard_open',
  'manual',
  'sign_in',
  'invite_sent',
  'profile_metadata_changed',
];

describe('shouldCreateConnectionHistoryBootstrap', () => {
  it.each(ROUTINE_TRIGGERS)('never creates a bootstrap for the %s trigger', (trigger) => {
    expect(
      shouldCreateConnectionHistoryBootstrap({
        trigger,
        hasAuthenticatedUser: true,
        accountKey: 'urn:li:fsd_profile:ACoAA-example',
        persistedJobExists: false,
      })
    ).toBe(false);
  });

  it('creates a bootstrap for the first authenticated extension entry', () => {
    expect(
      shouldCreateConnectionHistoryBootstrap({
        trigger: 'first_extension_entry',
        hasAuthenticatedUser: true,
        accountKey: 'urn:li:fsd_profile:ACoAA-example',
        persistedJobExists: false,
      })
    ).toBe(true);
  });

  it('requires an authenticated user and a resolvable account key', () => {
    expect(
      shouldCreateConnectionHistoryBootstrap({
        trigger: 'first_extension_entry',
        hasAuthenticatedUser: false,
        accountKey: 'urn:li:fsd_profile:ACoAA-example',
        persistedJobExists: false,
      })
    ).toBe(false);
    expect(
      shouldCreateConnectionHistoryBootstrap({
        trigger: 'first_extension_entry',
        hasAuthenticatedUser: true,
        accountKey: undefined,
        persistedJobExists: false,
      })
    ).toBe(false);
  });

  it('never creates a second bootstrap once one is persisted', () => {
    expect(
      shouldCreateConnectionHistoryBootstrap({
        trigger: 'first_extension_entry',
        hasAuthenticatedUser: true,
        accountKey: 'urn:li:fsd_profile:ACoAA-example',
        persistedJobExists: true,
      })
    ).toBe(false);
  });
});

describe('resolveConnectionHistoryJob', () => {
  beforeEach(() => {
    getProfileAnalyticsConnectionHistoryJob.mockReset();
    ensureConnectionHistoryBootstrapJob.mockReset();
  });

  it.each(ROUTINE_TRIGGERS)('does not create a history job on %s', async (trigger) => {
    getProfileAnalyticsConnectionHistoryJob.mockResolvedValue(null);

    const access = await resolveConnectionHistoryJob({ userId: 'user-1', profile, trigger });

    expect(access.job).toBeNull();
    expect(access.created).toBe(false);
    expect(ensureConnectionHistoryBootstrapJob).not.toHaveBeenCalled();
  });

  it('creates exactly one job on the first authenticated entry', async () => {
    getProfileAnalyticsConnectionHistoryJob.mockResolvedValue(null);
    ensureConnectionHistoryBootstrapJob.mockResolvedValue({
      id: 'connectionsBootstrap_abc',
      accountKey: 'urn:li:fsd_profile:ACoAA-example',
      status: 'scheduled',
      sessionId: 'session-1',
    });

    const access = await resolveConnectionHistoryJob({
      userId: 'user-1',
      profile,
      trigger: 'first_extension_entry',
    });

    expect(access.created).toBe(true);
    expect(ensureConnectionHistoryBootstrapJob).toHaveBeenCalledTimes(1);
  });

  it('does not create a second job on a later entry', async () => {
    getProfileAnalyticsConnectionHistoryJob.mockResolvedValue({
      id: 'connectionsBootstrap_abc',
      accountKey: 'urn:li:fsd_profile:ACoAA-example',
      status: 'scheduled',
      sessionId: 'session-1',
      nextStartIndex: 40,
    });

    const access = await resolveConnectionHistoryJob({
      userId: 'user-1',
      profile,
      trigger: 'first_extension_entry',
    });

    expect(access.created).toBe(false);
    expect(access.job?.sessionId).toBe('session-1');
    expect(ensureConnectionHistoryBootstrapJob).not.toHaveBeenCalled();
  });

  it('resumes the same session and checkpoint after local state is lost', async () => {
    getProfileAnalyticsConnectionHistoryJob.mockResolvedValue({
      id: 'connectionsBootstrap_abc',
      accountKey: 'urn:li:fsd_profile:ACoAA-example',
      status: 'running',
      sessionId: 'session-1',
      nextStartIndex: 120,
      collectedCount: 118,
    });

    const access = await resolveConnectionHistoryJob({ userId: 'user-1', profile, trigger: 'alarm' });

    expect(access.job?.sessionId).toBe('session-1');
    expect(access.job?.nextStartIndex).toBe(120);
    expect(ensureConnectionHistoryBootstrapJob).not.toHaveBeenCalled();
  });

  it('never restarts a completed job', async () => {
    getProfileAnalyticsConnectionHistoryJob.mockResolvedValue({
      id: 'connectionsBootstrap_abc',
      accountKey: 'urn:li:fsd_profile:ACoAA-example',
      status: 'complete',
      completedAt: 1_700_000_000_000,
    });

    const access = await resolveConnectionHistoryJob({
      userId: 'user-1',
      profile,
      trigger: 'first_extension_entry',
    });

    expect(access.job?.status).toBe('complete');
    expect(access.created).toBe(false);
    expect(ensureConnectionHistoryBootstrapJob).not.toHaveBeenCalled();
  });

  it('leaves a needs_repair job for an explicit manual action', async () => {
    getProfileAnalyticsConnectionHistoryJob.mockResolvedValue({
      id: 'connectionsBootstrap_abc',
      accountKey: 'urn:li:fsd_profile:ACoAA-example',
      status: 'needs_repair',
      sessionId: 'session-1',
      error: 'LinkedIn stopped responding.',
    });

    const access = await resolveConnectionHistoryJob({ userId: 'user-1', profile, trigger: 'alarm' });

    expect(access.job?.status).toBe('needs_repair');
    expect(access.created).toBe(false);
    expect(ensureConnectionHistoryBootstrapJob).not.toHaveBeenCalled();
  });

  it('scopes the job to the LinkedIn account, so a new account gets its own', async () => {
    getProfileAnalyticsConnectionHistoryJob.mockResolvedValue(null);
    ensureConnectionHistoryBootstrapJob.mockResolvedValue({
      id: 'connectionsBootstrap_def',
      accountKey: 'urn:li:fsd_profile:ACoAA-other',
      status: 'scheduled',
    });

    const access = await resolveConnectionHistoryJob({
      userId: 'user-1',
      profile: { ...profile, profileUrn: 'urn:li:fsd_profile:ACoAA-other' },
      trigger: 'first_extension_entry',
    });

    expect(getProfileAnalyticsConnectionHistoryJob).toHaveBeenCalledWith(
      'user-1',
      'urn:li:fsd_profile:ACoAA-other'
    );
    expect(access.created).toBe(true);
  });

  it('falls back through member id and username when no profile urn exists', async () => {
    getProfileAnalyticsConnectionHistoryJob.mockResolvedValue(null);

    await resolveConnectionHistoryJob({
      userId: 'user-1',
      profile: { ...profile, profileUrn: undefined, memberNumericId: '12345' },
      trigger: 'alarm',
    });
    expect(getProfileAnalyticsConnectionHistoryJob).toHaveBeenLastCalledWith('user-1', '12345');

    await resolveConnectionHistoryJob({
      userId: 'user-1',
      profile: { ...profile, profileUrn: undefined, memberNumericId: undefined, linkedinUsername: 'Example' },
      trigger: 'alarm',
    });
    expect(getProfileAnalyticsConnectionHistoryJob).toHaveBeenLastCalledWith('user-1', 'example');
  });
});
