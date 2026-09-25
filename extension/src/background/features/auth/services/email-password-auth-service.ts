import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from 'shared/firebase-config';

export async function signInWithEmailPassword(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return result.user;
}

export async function registerWithEmailPassword(params: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<User> {
  const displayName = `${params.firstName.trim()} ${params.lastName.trim()}`.trim();
  const result = await createUserWithEmailAndPassword(getFirebaseAuth(), params.email.trim(), params.password);
  await updateProfile(result.user, { displayName });
  await sendEmailVerification(result.user).catch((error) => {
    console.warn('[feeds-auth] Verification email could not be sent:', error);
  });
  return result.user;
}
