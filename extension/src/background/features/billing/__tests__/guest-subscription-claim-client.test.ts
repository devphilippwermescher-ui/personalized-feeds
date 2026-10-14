import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  getIdToken: vi.fn(),
  user: { uid: 'user-1' } as { uid: string; getIdToken?: (forceRefresh?: boolean) => Promise<string> },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => mocks.callable),
}));
vi.mock('shared/app-environment', () => ({ getAppEnvironment: () => 'staging' }));
vi.mock('../../../platform/firebase/callable-functions', () => ({ getCallableFunctions: () => ({}) }));
vi.mock('../../../../services/auth', () => ({
  waitForAuthReady: vi.fn(async () => mocks.user),
}));

describe('guest subscription claim client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.user = { uid: 'user-1', getIdToken: mocks.getIdToken };
    mocks.getIdToken.mockResolvedValue('token');
    mocks.callable
      .mockResolvedValueOnce({ data: { claimedCount: 0, verificationRequired: true } })
      .mockResolvedValueOnce({ data: { claimedCount: 1, verificationRequired: false } });
  });

  it('uses the short cache normally but bypasses it after email verification', async () => {
    const { claimGuestBillingSubscription } = await import('../services/billing-functions-client');

    await expect(claimGuestBillingSubscription()).resolves.toEqual({
      claimedCount: 0,
      verificationRequired: true,
    });
    await expect(claimGuestBillingSubscription()).resolves.toEqual({
      claimedCount: 0,
      verificationRequired: true,
    });
    await expect(claimGuestBillingSubscription({ force: true })).resolves.toEqual({
      claimedCount: 1,
      verificationRequired: false,
    });

    expect(mocks.callable).toHaveBeenCalledTimes(2);
    expect(mocks.getIdToken).toHaveBeenCalledTimes(2);
    expect(mocks.getIdToken).toHaveBeenCalledWith(true);
  });

  it('does not reuse one Firebase user claim result for another user', async () => {
    const { claimGuestBillingSubscription } = await import('../services/billing-functions-client');

    await claimGuestBillingSubscription();
    mocks.user = { uid: 'user-2', getIdToken: mocks.getIdToken };
    await claimGuestBillingSubscription();

    expect(mocks.callable).toHaveBeenCalledTimes(2);
  });
});
