import type { User } from 'firebase/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { name: 'test-auth' },
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('shared/firebase-config', () => ({
  getFirebaseAuth: () => mocks.auth,
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  sendEmailVerification: mocks.sendEmailVerification,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  updateProfile: mocks.updateProfile,
}));

import { registerWithEmailPassword, signInWithEmailPassword } from '../services/email-password-auth-service';

const user = { uid: 'user-1' } as User;

describe('email/password Firebase auth service', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('signs in without persisting the password outside Firebase Auth', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user });

    await expect(signInWithEmailPassword(' user@example.com ', 'secret-password')).resolves.toBe(user);

    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(mocks.auth, 'user@example.com', 'secret-password');
  });

  it('creates an account and stores the combined display name in Firebase Auth', async () => {
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user });
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.sendEmailVerification.mockResolvedValue(undefined);

    await expect(
      registerWithEmailPassword({
        firstName: ' Ada ',
        lastName: ' Lovelace ',
        email: ' ada@example.com ',
        password: 'analytical-engine',
      })
    ).resolves.toBe(user);

    expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      mocks.auth,
      'ada@example.com',
      'analytical-engine'
    );
    expect(mocks.updateProfile).toHaveBeenCalledWith(user, { displayName: 'Ada Lovelace' });
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(user);
  });
});
