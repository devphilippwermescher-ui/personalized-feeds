import type { User } from 'firebase/auth';
import { createUserProfile, getUserProfile } from 'shared/firestore-service';

let readyUserId: string | null = null;
let readinessGeneration = 0;
let pendingReadiness: { userId: string; promise: Promise<void> } | null = null;

function createProfileFromAuthUser(user: User): Promise<void> {
  return createUserProfile({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || undefined,
    createdAt: Date.now(),
  });
}

export function ensureAuthenticatedUserProfile(user: User): Promise<void> {
  if (readyUserId === user.uid) {
    return Promise.resolve();
  }
  if (pendingReadiness?.userId === user.uid) {
    return pendingReadiness.promise;
  }

  const generation = readinessGeneration;
  const promise = getUserProfile(user.uid)
    .then(async (profile) => {
      if (!profile) {
        await createProfileFromAuthUser(user);
      }
      if (readinessGeneration === generation) {
        readyUserId = user.uid;
      }
    })
    .finally(() => {
      if (pendingReadiness?.promise === promise) {
        pendingReadiness = null;
      }
    });

  pendingReadiness = { userId: user.uid, promise };
  return promise;
}

export function resetAuthenticatedUserProfileReadiness(): void {
  readinessGeneration += 1;
  readyUserId = null;
  pendingReadiness = null;
}
