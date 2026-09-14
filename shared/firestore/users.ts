import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';
import type { UserFeatureSettings, UserProfile, UserProfilePreferences } from '../types';
import { normalizeUserProfilePreferences } from '../user-profile-preferences';
import { emailIndexCollection, normalizeEmail, profilePreferencesDoc, settingsDoc } from './refs';

const DEFAULT_USER_FEATURE_SETTINGS: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
  hideProfileViewers: false,
};

// ── User ──

export async function createUserProfile(profile: UserProfile): Promise<void> {
  const userRef = doc(getFirebaseDb(), 'users', profile.uid);
  const existing = await getDoc(userRef);
  const createdAt = existing.exists()
    ? ((existing.data() as UserProfile).createdAt || profile.createdAt)
    : profile.createdAt;

  await setDoc(userRef, {
    ...profile,
    createdAt,
  });

  if (profile.email.trim()) {
    await setDoc(doc(emailIndexCollection(), normalizeEmail(profile.email)), {
      uid: profile.uid,
      email: profile.email.trim(),
      displayName: profile.displayName,
      photoURL: profile.photoURL || '',
      updatedAt: Date.now(),
    });
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getFirebaseDb(), 'users', userId));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function getUserFeatureSettings(userId: string): Promise<UserFeatureSettings> {
  const snap = await getDoc(settingsDoc(userId));
  if (!snap.exists()) {
    return DEFAULT_USER_FEATURE_SETTINGS;
  }

  const data = snap.data() as Partial<UserFeatureSettings>;
  return {
    messagingButtons: data.messagingButtons ?? DEFAULT_USER_FEATURE_SETTINGS.messagingButtons,
    postButtons: data.postButtons ?? DEFAULT_USER_FEATURE_SETTINGS.postButtons,
    speechToComment: data.speechToComment ?? DEFAULT_USER_FEATURE_SETTINGS.speechToComment,
    hideProfileViewers: data.hideProfileViewers ?? DEFAULT_USER_FEATURE_SETTINGS.hideProfileViewers,
  };
}

export async function updateUserFeatureSettings(
  userId: string,
  updates: Partial<UserFeatureSettings>
): Promise<UserFeatureSettings> {
  const current = await getUserFeatureSettings(userId);
  const next = {
    ...current,
    ...updates,
  };

  await setDoc(settingsDoc(userId), next, { merge: true });
  return next;
}

export async function getUserProfilePreferences(userId: string): Promise<UserProfilePreferences> {
  const snap = await getDoc(profilePreferencesDoc(userId));
  return normalizeUserProfilePreferences(
    snap.exists() ? (snap.data() as Partial<UserProfilePreferences>) : null
  );
}

export async function updateUserProfilePreferences(
  userId: string,
  preferences: UserProfilePreferences
): Promise<UserProfilePreferences> {
  const normalized = normalizeUserProfilePreferences(preferences);
  await setDoc(profilePreferencesDoc(userId), normalized, { merge: true });
  return normalized;
}

export async function findUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const emailSnap = await getDoc(doc(emailIndexCollection(), normalizedEmail));
  if (!emailSnap.exists()) {
    return null;
  }

  const data = emailSnap.data() as { uid?: string };
  if (!data.uid) {
    return null;
  }

  return getUserProfile(data.uid);
}

// ── Feeds ──
