import type { User } from 'firebase/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAuthenticatedUserProfile: vi.fn(),
  getCurrentUser: vi.fn(),
  signInWithGoogleTokens: vi.fn(),
  waitForAuthReady: vi.fn(),
}));

vi.mock('../../../../services/auth', () => ({
  getCurrentUser: mocks.getCurrentUser,
  signInWithGoogleTokens: mocks.signInWithGoogleTokens,
  waitForAuthReady: mocks.waitForAuthReady,
}));
vi.mock('../services/user-profile-readiness', () => ({
  ensureAuthenticatedUserProfile: mocks.ensureAuthenticatedUserProfile,
}));

import { getAuthenticatedFeedsUser } from '../services/authenticated-user';

const authUser = { uid: 'user-1' } as User;

describe('authenticated feeds user', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('repairs the profile before returning an already restored Firebase user', async () => {
    mocks.getCurrentUser.mockReturnValue(authUser);
    mocks.ensureAuthenticatedUserProfile.mockResolvedValue(undefined);

    await expect(getAuthenticatedFeedsUser()).resolves.toBe(authUser);

    expect(mocks.ensureAuthenticatedUserProfile).toHaveBeenCalledOnce();
    expect(mocks.ensureAuthenticatedUserProfile).toHaveBeenCalledWith(authUser);
    expect(mocks.waitForAuthReady).not.toHaveBeenCalled();
  });

  it('does not expose the user when profile initialization fails', async () => {
    mocks.getCurrentUser.mockReturnValue(authUser);
    mocks.ensureAuthenticatedUserProfile.mockRejectedValue(new Error('profile write failed'));

    await expect(getAuthenticatedFeedsUser()).rejects.toThrow('profile write failed');
  });
});
