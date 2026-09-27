import { GoogleAuthProvider, signInWithCredential, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirebaseAuth } from 'shared/firebase-config';

const AUTH_STATE_TIMEOUT_MS = 8000;

export async function signInWithGoogleTokens(idToken: string, accessToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  const firebaseAuth = getFirebaseAuth();
  const result = await signInWithCredential(firebaseAuth, credential);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  await firebaseSignOut(firebaseAuth);
}

export function getCurrentUser(): User | null {
  return getFirebaseAuth().currentUser;
}

export async function waitForAuthReady(timeoutMs = AUTH_STATE_TIMEOUT_MS): Promise<User | null> {
  const firebaseAuth = getFirebaseAuth();
  if (firebaseAuth.currentUser) {
    return firebaseAuth.currentUser;
  }

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      clearTimeout(timeoutId);
      unsubscribe();
      resolve(user);
    });

    const timeoutId = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, timeoutMs);
  });
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}
