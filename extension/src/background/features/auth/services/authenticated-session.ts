import type { User } from 'firebase/auth';
import type { UserProfilePreferences } from 'shared/types';
import { getUserProfilePreferences } from 'shared/firestore-service';
import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import { DEFAULT_USER_PROFILE_PREFERENCES } from 'shared/user-profile-preferences';
import { signInWithGoogleTokens } from '../../../../services/auth';
import { queueProfileAnalyticsSync } from '../../profile-analytics/profile-analytics-sync-coordinator';
import { queueProfileViewersFirstSurfaceSync } from '../../profile-viewers/profile-viewers-coordinator';
import { appendProfileViewersWakeEvent } from '../../profile-viewers/profile-viewers-coordinator-storage';
import { queueProfileViewersStatusSync } from '../../profile-viewers/profile-viewers-status-sync';
import {
  clearStoredFeedsAuthTokens,
  formatUserInfo,
  getStoredUserProfilePreferences,
  persistUserProfilePreferencesToStorage,
  setStoredFeedsAuthTokens,
} from './authenticated-user';
import { registerWithEmailPassword, signInWithEmailPassword } from './email-password-auth-service';
import { ensureAuthenticatedUserProfile } from './user-profile-readiness';
import { claimGuestBillingSubscription } from '../../billing/public';

interface GoogleAuthTokens {
  idToken: string;
  accessToken: string;
}

function requireAuthString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }
  return normalized;
}

function validateEmailPassword(message: Record<string, unknown>): { email: string; password: string } {
  const email = requireAuthString(message.email, 'Email', 320);
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  if (typeof message.password !== 'string' || !message.password) {
    throw new Error('Password is required.');
  }
  if (message.password.length > 4096) {
    throw new Error('Password is too long.');
  }
  return { email, password: message.password };
}

function validateEmailRegistration(message: Record<string, unknown>): {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
} {
  const credentials = validateEmailPassword(message);
  const firstName = requireAuthString(message.firstName, 'First name', 60);
  const lastName = typeof message.lastName === 'string' ? message.lastName.trim() : '';
  if (lastName.length > 60) throw new Error('Last name is too long.');
  if (credentials.password.length < 6) throw new Error('Password must be at least 6 characters.');
  if (message.acceptedPersonalData !== true) {
    throw new Error('Agree to the processing of personal data to create an account.');
  }
  return { ...credentials, firstName, lastName };
}

export function schedulePostSignInWork(): void {
  void appendProfileViewersWakeEvent({
    event: 'sign_in',
    trigger: 'sign_in',
  });
  void queueProfileViewersFirstSurfaceSync('sign_in').finally(() => {
    void queueProfileViewersStatusSync({ trigger: 'sign_in', urgent: true });
    if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
      void queueProfileAnalyticsSync('first_extension_entry');
    }
  });
}

export async function resolveUserProfilePreferences(userId: string): Promise<UserProfilePreferences> {
  const stored = await getStoredUserProfilePreferences(userId);
  try {
    const preferences = await getUserProfilePreferences(userId);
    await persistUserProfilePreferencesToStorage(userId, preferences);
    return preferences;
  } catch (error) {
    console.warn('[profile-preferences] Remote preferences could not be loaded:', error);
    return stored || DEFAULT_USER_PROFILE_PREFERENCES;
  }
}

async function completeFeedsAuthentication(user: User, googleTokens?: GoogleAuthTokens): Promise<User> {
  await ensureAuthenticatedUserProfile(user);

  if (googleTokens) {
    await setStoredFeedsAuthTokens({
      ...googleTokens,
      updatedAt: Date.now(),
    });
  } else {
    await clearStoredFeedsAuthTokens();
  }

  await chrome.storage.local.set({
    feedsUserInfo: formatUserInfo(
      {
        uid: user.uid,
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
      },
      await resolveUserProfilePreferences(user.uid)
    ),
  });
  await claimGuestBillingSubscription().catch((error) => {
    console.warn('[billing] Guest subscription claim could not be completed:', error);
  });
  return user;
}

export async function authenticateFeedsWithGoogle(tokens: GoogleAuthTokens): Promise<User> {
  const user = await signInWithGoogleTokens(tokens.idToken, tokens.accessToken);
  return completeFeedsAuthentication(user, tokens);
}

export async function authenticateFeedsWithEmail(message: Record<string, unknown>): Promise<User> {
  const credentials = validateEmailPassword(message);
  const user = await signInWithEmailPassword(credentials.email, credentials.password);
  return completeFeedsAuthentication(user);
}

export async function registerFeedsWithEmail(message: Record<string, unknown>): Promise<User> {
  const registration = validateEmailRegistration(message);
  const user = await registerWithEmailPassword(registration);
  return completeFeedsAuthentication(user);
}
