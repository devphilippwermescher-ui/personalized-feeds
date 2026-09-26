import type { User } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendWakeEvent: vi.fn(),
  claimGuestBillingSubscription: vi.fn(),
  clearStoredFeedsAuthTokens: vi.fn(),
  ensureAuthenticatedUserProfile: vi.fn(),
  formatUserInfo: vi.fn(),
  getStoredUserProfilePreferences: vi.fn(),
  getUserProfilePreferences: vi.fn(),
  persistUserProfilePreferencesToStorage: vi.fn(),
  queueProfileAnalyticsSync: vi.fn(),
  queueProfileViewersFirstSurfaceSync: vi.fn(),
  queueProfileViewersStatusSync: vi.fn(),
  registerWithEmailPassword: vi.fn(),
  setStoredFeedsAuthTokens: vi.fn(),
  signInWithEmailPassword: vi.fn(),
  signInWithGoogleTokens: vi.fn(),
  storageSet: vi.fn(),
}));

vi.mock('shared/firestore-service', () => ({
  getUserProfilePreferences: mocks.getUserProfilePreferences,
}));
vi.mock('shared/feature-flags', () => ({ DASHBOARD_ANALYTICS_SYNC_ENABLED: false }));
vi.mock('shared/user-profile-preferences', () => ({
  DEFAULT_USER_PROFILE_PREFERENCES: { displayName: '', avatarDataUrl: '', billingCurrency: 'EUR' },
}));
vi.mock('../../../../services/auth', () => ({ signInWithGoogleTokens: mocks.signInWithGoogleTokens }));
vi.mock('../../profile-analytics/profile-analytics-sync-coordinator', () => ({
  queueProfileAnalyticsSync: mocks.queueProfileAnalyticsSync,
}));
vi.mock('../../profile-viewers/profile-viewers-coordinator', () => ({
  queueProfileViewersFirstSurfaceSync: mocks.queueProfileViewersFirstSurfaceSync,
}));
vi.mock('../../profile-viewers/profile-viewers-coordinator-storage', () => ({
  appendProfileViewersWakeEvent: mocks.appendWakeEvent,
}));
vi.mock('../../profile-viewers/profile-viewers-status-sync', () => ({
  queueProfileViewersStatusSync: mocks.queueProfileViewersStatusSync,
}));
vi.mock('../../billing/public', () => ({
  claimGuestBillingSubscription: mocks.claimGuestBillingSubscription,
}));
vi.mock('../services/authenticated-user', () => ({
  clearStoredFeedsAuthTokens: mocks.clearStoredFeedsAuthTokens,
  formatUserInfo: mocks.formatUserInfo,
  getStoredUserProfilePreferences: mocks.getStoredUserProfilePreferences,
  persistUserProfilePreferencesToStorage: mocks.persistUserProfilePreferencesToStorage,
  setStoredFeedsAuthTokens: mocks.setStoredFeedsAuthTokens,
}));
vi.mock('../services/email-password-auth-service', () => ({
  registerWithEmailPassword: mocks.registerWithEmailPassword,
  signInWithEmailPassword: mocks.signInWithEmailPassword,
}));
vi.mock('../services/user-profile-readiness', () => ({
  ensureAuthenticatedUserProfile: mocks.ensureAuthenticatedUserProfile,
}));

import {
  authenticateFeedsWithEmail,
  registerFeedsWithEmail,
  schedulePostSignInWork,
} from '../services/authenticated-session';

const user = {
  uid: 'user-1',
  email: 'user@example.com',
  displayName: 'Example User',
  photoURL: null,
} as User;

describe('authenticated feeds session', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { storage: { local: { set: mocks.storageSet } } });
    mocks.signInWithEmailPassword.mockResolvedValue(user);
    mocks.registerWithEmailPassword.mockResolvedValue(user);
    mocks.ensureAuthenticatedUserProfile.mockResolvedValue(undefined);
    mocks.clearStoredFeedsAuthTokens.mockResolvedValue(undefined);
    mocks.getStoredUserProfilePreferences.mockResolvedValue(null);
    mocks.getUserProfilePreferences.mockResolvedValue({ displayName: '', avatarDataUrl: '', billingCurrency: 'EUR' });
    mocks.persistUserProfilePreferencesToStorage.mockResolvedValue(undefined);
    mocks.formatUserInfo.mockReturnValue({ isAuthenticated: true, userId: user.uid });
    mocks.storageSet.mockResolvedValue(undefined);
    mocks.appendWakeEvent.mockResolvedValue(undefined);
    mocks.claimGuestBillingSubscription.mockResolvedValue({ claimedCount: 0, verificationRequired: false });
    mocks.queueProfileViewersFirstSurfaceSync.mockResolvedValue(undefined);
    mocks.queueProfileViewersStatusSync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('clears stale Google tokens after email/password sign-in', async () => {
    await expect(
      authenticateFeedsWithEmail({ email: ' user@example.com ', password: ' password with spaces ' })
    ).resolves.toBe(user);

    expect(mocks.signInWithEmailPassword).toHaveBeenCalledWith('user@example.com', ' password with spaces ');
    expect(mocks.clearStoredFeedsAuthTokens).toHaveBeenCalledOnce();
    expect(mocks.ensureAuthenticatedUserProfile).toHaveBeenCalledWith(user);
    expect(mocks.claimGuestBillingSubscription).toHaveBeenCalledOnce();
    expect(mocks.storageSet).toHaveBeenCalledWith({
      feedsUserInfo: { isAuthenticated: true, userId: 'user-1' },
    });
    expect(mocks.queueProfileViewersFirstSurfaceSync).not.toHaveBeenCalled();
  });

  it('starts profile visitor collection only after the authenticated surface is ready', async () => {
    schedulePostSignInWork();

    expect(mocks.appendWakeEvent).toHaveBeenCalledWith({ event: 'sign_in', trigger: 'sign_in' });
    expect(mocks.queueProfileViewersFirstSurfaceSync).toHaveBeenCalledWith('sign_in');
  });

  it('requires personal-data consent before creating an account', async () => {
    await expect(
      registerFeedsWithEmail({
        firstName: 'Ada',
        lastName: '',
        email: 'ada@example.com',
        password: 'analytical-engine',
        acceptedPersonalData: false,
      })
    ).rejects.toThrow('Agree to the processing of personal data');

    expect(mocks.registerWithEmailPassword).not.toHaveBeenCalled();
  });
});
