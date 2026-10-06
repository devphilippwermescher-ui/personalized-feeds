import type { User } from 'firebase/auth';
import { createUserProfile, getUserProfile } from 'shared/firestore-service';
import type { UserProfile } from 'shared/types';

let readyUserId: string | null = null;
let readyProfileSignature: string | null = null;
let readinessGeneration = 0;
let pendingReadiness: { userId: string; profileSignature: string; promise: Promise<void> } | null = null;

function getAuthProfileSignature(user: User): string {
  return [user.uid, user.email || '', user.displayName || '', user.photoURL || ''].join('\n');
}

function profileNeedsAuthRefresh(profile: UserProfile, user: User): boolean {
  const authEmail = user.email?.trim() || '';
  const authDisplayName = user.displayName?.trim() || '';
  const authPhotoURL = user.photoURL?.trim() || '';
  const profileEmail = typeof profile.email === 'string' ? profile.email.trim() : '';
  const profileDisplayName = typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
  const profilePhotoURL = typeof profile.photoURL === 'string' ? profile.photoURL.trim() : '';

  return Boolean(
    (authEmail && profileEmail.toLowerCase() !== authEmail.toLowerCase()) ||
    (authDisplayName && profileDisplayName !== authDisplayName) ||
    (authPhotoURL && profilePhotoURL !== authPhotoURL)
  );
}

function createProfileFromAuthUser(user: User, existingProfile?: UserProfile | null): Promise<void> {
  return createUserProfile({
    uid: user.uid,
    email: user.email || existingProfile?.email || '',
    displayName: user.displayName || existingProfile?.displayName || '',
    photoURL: user.photoURL || existingProfile?.photoURL || '',
    createdAt: existingProfile?.createdAt || Date.now(),
  });
}

export function ensureAuthenticatedUserProfile(user: User): Promise<void> {
  const profileSignature = getAuthProfileSignature(user);
  if (readyUserId === user.uid && readyProfileSignature === profileSignature) {
    return Promise.resolve();
  }
  if (pendingReadiness?.userId === user.uid) {
    if (pendingReadiness.profileSignature === profileSignature) {
      return pendingReadiness.promise;
    }
    return pendingReadiness.promise.then(
      () => ensureAuthenticatedUserProfile(user),
      () => ensureAuthenticatedUserProfile(user)
    );
  }

  const generation = readinessGeneration;
  const promise = getUserProfile(user.uid)
    .then(async (profile) => {
      if (!profile || profileNeedsAuthRefresh(profile, user)) {
        await createProfileFromAuthUser(user, profile);
      }
      if (readinessGeneration === generation) {
        readyUserId = user.uid;
        readyProfileSignature = profileSignature;
      }
    })
    .finally(() => {
      if (pendingReadiness?.promise === promise) {
        pendingReadiness = null;
      }
    });

  pendingReadiness = { userId: user.uid, profileSignature, promise };
  return promise;
}

export function resetAuthenticatedUserProfileReadiness(): void {
  readinessGeneration += 1;
  readyUserId = null;
  readyProfileSignature = null;
  pendingReadiness = null;
}
