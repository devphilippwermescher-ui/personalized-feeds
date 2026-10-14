import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from 'shared/firebase-config';

export interface EmailPasswordRegistrationResult {
  user: User;
  verificationEmailSent: boolean;
}

export async function signInWithEmailPassword(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return result.user;
}

export async function registerWithEmailPassword(params: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<EmailPasswordRegistrationResult> {
  const displayName = `${params.firstName.trim()} ${params.lastName.trim()}`.trim();
  const result = await createUserWithEmailAndPassword(getFirebaseAuth(), params.email.trim(), params.password);
  await updateProfile(result.user, { displayName });
  const verificationEmailSent = await sendEmailVerification(result.user).then(
    () => true,
    (error) => {
      console.warn('[feeds-auth] Verification email could not be sent:', error);
      return false;
    }
  );
  return { user: result.user, verificationEmailSent };
}

function requireCurrentUser(): User {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to verify your email.');
  return user;
}

export async function resendCurrentUserVerificationEmail(): Promise<{ alreadyVerified: boolean }> {
  const user = requireCurrentUser();
  await reload(user);
  if (user.emailVerified) return { alreadyVerified: true };
  await sendEmailVerification(user);
  return { alreadyVerified: false };
}

export async function refreshCurrentUserEmailVerification(): Promise<boolean> {
  const user = requireCurrentUser();
  await reload(user);
  await user.getIdToken(true);
  return user.emailVerified;
}
