import type { User } from 'firebase/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { name: 'test-auth', currentUser: null as User | null },
  createUserWithEmailAndPassword: vi.fn(),
  reload: vi.fn(),
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('shared/firebase-config', () => ({
  getFirebaseAuth: () => mocks.auth,
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  reload: mocks.reload,
  sendEmailVerification: mocks.sendEmailVerification,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  updateProfile: mocks.updateProfile,
}));

import {
  refreshCurrentUserEmailVerification,
  registerWithEmailPassword,
  resendCurrentUserVerificationEmail,
  signInWithEmailPassword,
} from '../services/email-password-auth-service';

const getIdToken = vi.fn();
const user = { uid: 'user-1', emailVerified: false, getIdToken } as unknown as User;

describe('email/password Firebase auth service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.auth.currentUser = null;
    (user as { emailVerified: boolean }).emailVerified = false;
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
    ).resolves.toEqual({ user, verificationEmailSent: true });

    expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      mocks.auth,
      'ada@example.com',
      'analytical-engine'
    );
    expect(mocks.updateProfile).toHaveBeenCalledWith(user, { displayName: 'Ada Lovelace' });
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(user);
  });

  it('keeps the created account usable when the first verification email cannot be sent', async () => {
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user });
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.sendEmailVerification.mockRejectedValue(new Error('mail unavailable'));

    await expect(
      registerWithEmailPassword({
        firstName: 'Ada',
        lastName: '',
        email: 'ada@example.com',
        password: 'analytical-engine',
      })
    ).resolves.toEqual({ user, verificationEmailSent: false });
  });

  it('resends verification for the current unverified user', async () => {
    mocks.auth.currentUser = user;
    mocks.reload.mockResolvedValue(undefined);
    mocks.sendEmailVerification.mockResolvedValue(undefined);

    await expect(resendCurrentUserVerificationEmail()).resolves.toEqual({ alreadyVerified: false });

    expect(mocks.reload).toHaveBeenCalledWith(user);
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(user);
  });

  it('does not resend after Firebase reports that the email is verified', async () => {
    mocks.auth.currentUser = user;
    mocks.reload.mockImplementation(async () => {
      (user as { emailVerified: boolean }).emailVerified = true;
    });

    await expect(resendCurrentUserVerificationEmail()).resolves.toEqual({ alreadyVerified: true });

    expect(mocks.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('reloads the user and forces a fresh token before reporting verification', async () => {
    mocks.auth.currentUser = user;
    mocks.reload.mockImplementation(async () => {
      (user as { emailVerified: boolean }).emailVerified = true;
    });
    getIdToken.mockResolvedValue('fresh-token');

    await expect(refreshCurrentUserEmailVerification()).resolves.toBe(true);

    expect(getIdToken).toHaveBeenCalledWith(true);
  });
});
