import type { User } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createUserProfile: vi.fn(),
  getUserProfile: vi.fn(),
}));

vi.mock('shared/firestore-service', () => ({
  createUserProfile: mocks.createUserProfile,
  getUserProfile: mocks.getUserProfile,
}));

import {
  ensureAuthenticatedUserProfile,
  resetAuthenticatedUserProfileReadiness,
} from '../services/user-profile-readiness';

const authUser = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'Example User',
  photoURL: 'https://example.com/avatar.png',
} as User;

describe('authenticated user profile readiness', () => {
  beforeEach(() => {
    resetAuthenticatedUserProfileReadiness();
    mocks.createUserProfile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('repairs a missing Firestore user document from Firebase Auth', async () => {
    mocks.getUserProfile.mockResolvedValue(null);

    await ensureAuthenticatedUserProfile(authUser);

    expect(mocks.createUserProfile).toHaveBeenCalledWith({
      uid: 'user-1',
      email: 'user@example.com',
      displayName: 'Example User',
      photoURL: 'https://example.com/avatar.png',
      createdAt: expect.any(Number),
    });
  });

  it('does not rewrite an existing user document or recheck it in the same worker session', async () => {
    mocks.getUserProfile.mockResolvedValue({ uid: 'user-1' });

    await ensureAuthenticatedUserProfile(authUser);
    await ensureAuthenticatedUserProfile(authUser);

    expect(mocks.getUserProfile).toHaveBeenCalledOnce();
    expect(mocks.createUserProfile).not.toHaveBeenCalled();
  });

  it('shares one repair between concurrent auth requests', async () => {
    let resolveProfileLookup: (value: null) => void = () => {
      throw new Error('Profile lookup was not started');
    };
    mocks.getUserProfile.mockReturnValue(
      new Promise<null>((resolve) => {
        resolveProfileLookup = resolve;
      })
    );

    const first = ensureAuthenticatedUserProfile(authUser);
    const second = ensureAuthenticatedUserProfile(authUser);
    resolveProfileLookup(null);
    await Promise.all([first, second]);

    expect(mocks.getUserProfile).toHaveBeenCalledOnce();
    expect(mocks.createUserProfile).toHaveBeenCalledOnce();
  });

  it('retries after a failed repair instead of caching a broken profile state', async () => {
    mocks.getUserProfile.mockResolvedValue(null);
    mocks.createUserProfile
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);

    await expect(ensureAuthenticatedUserProfile(authUser)).rejects.toThrow('temporary failure');
    await expect(ensureAuthenticatedUserProfile(authUser)).resolves.toBeUndefined();

    expect(mocks.getUserProfile).toHaveBeenCalledTimes(2);
    expect(mocks.createUserProfile).toHaveBeenCalledTimes(2);
  });
});
