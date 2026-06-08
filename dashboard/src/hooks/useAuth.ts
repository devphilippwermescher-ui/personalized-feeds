import { useState, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from 'shared/firebase-config';
import { createUserProfile } from 'shared/firestore-service';

const AUTH_READY_TIMEOUT_MS = 5000;
const EXTENSION_ID = 'opgnfeilbmdpojamipidejalbiddapla';

type ExtensionSyncResponse =
  | {
      success: true;
      isAuthenticated: boolean;
      idToken?: string;
      accessToken?: string;
      userId?: string;
      displayName?: string;
      email?: string;
      photoURL?: string;
    }
  | {
      success: false;
      error: string;
    };

function sendMessageToExtension(message: Record<string, unknown>): Promise<ExtensionSyncResponse> {
  return new Promise((resolve) => {
    const runtime = window.chrome?.runtime;
    if (!runtime?.sendMessage) {
      resolve({ success: false, error: 'Chrome extension messaging is unavailable in this browser.' });
      return;
    }

    runtime.sendMessage(
      EXTENSION_ID,
      message,
      (response?: unknown) => {
        if (window.chrome?.runtime?.lastError) {
          resolve({ success: false, error: window.chrome.runtime.lastError.message });
          return;
        }

        resolve((response as ExtensionSyncResponse | undefined) || { success: false, error: 'No response from extension.' });
      }
    );
  });
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [extensionAuthAvailable, setExtensionAuthAvailable] = useState(false);
  const [extensionAuthLoading, setExtensionAuthLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const auth = getFirebaseAuth();
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (!cancelled) {
          resolved = true;
          setUser(firebaseUser);
          setLoading(false);
          setAuthError(null);
        }
      });

      timeoutId = setTimeout(() => {
        if (!cancelled && !resolved) {
          setLoading(false);
          setAuthError('Auth check timed out. You can try signing in.');
        }
      }, AUTH_READY_TIMEOUT_MS);

      return () => {
        cancelled = true;
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe();
      };
    } catch (err) {
      if (!cancelled) {
        const message = err instanceof Error ? err.message : String(err);
        setAuthError(message);
        setLoading(false);
      }
      return () => {
        cancelled = true;
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void sendMessageToExtension({ type: 'DASHBOARD_GET_EXTENSION_AUTH_STATE' }).then((response) => {
      if (cancelled) {
        return;
      }

      setExtensionAuthAvailable(response.success && response.isAuthenticated === true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      await createUserProfile({
        uid: result.user.uid,
        email: result.user.email || '',
        displayName: result.user.displayName || '',
        photoURL: result.user.photoURL || undefined,
        createdAt: Date.now(),
      });

      return result.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    }
  };

  const logout = async () => {
    const auth = getFirebaseAuth();
    await signOut(auth);
  };

  const signInWithExtension = async () => {
    setAuthError(null);
    setExtensionAuthLoading(true);

    try {
      const response = await sendMessageToExtension({ type: 'DASHBOARD_SYNC_AUTH' });

      if (!response.success) {
        throw new Error(response.error);
      }

      if (!response.idToken || !response.accessToken) {
        throw new Error('Extension did not return Google credentials.');
      }

      const auth = getFirebaseAuth();
      const credential = GoogleAuthProvider.credential(response.idToken, response.accessToken);
      const result = await signInWithCredential(auth, credential);

      await createUserProfile({
        uid: result.user.uid,
        email: result.user.email || '',
        displayName: result.user.displayName || '',
        photoURL: result.user.photoURL || undefined,
        createdAt: Date.now(),
      });

      setExtensionAuthAvailable(true);
      return result.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
      throw err;
    } finally {
      setExtensionAuthLoading(false);
    }
  };

  return {
    user,
    loading,
    authError,
    signInWithGoogle,
    signInWithExtension,
    logout,
    extensionAuthAvailable,
    extensionAuthLoading,
  };
}
