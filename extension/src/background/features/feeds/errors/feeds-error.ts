export function normalizeFeedsError(error: unknown, fallback = 'Something went wrong'): string {
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : typeof error === 'string'
        ? error
        : '';

  const normalized = `${code} ${message}`.toLowerCase();

  console.warn('[feeds-error]', { code, message, normalized });

  if (
    normalized.includes('not authenticated') ||
    normalized.includes('unauthenticated') ||
    normalized.includes('auth/user-token-expired')
  ) {
    return 'Session expired, please sign in again.';
  }

  if (
    normalized.includes('auth/invalid-credential') ||
    normalized.includes('auth/wrong-password') ||
    normalized.includes('auth/user-not-found')
  ) {
    return 'Incorrect email or password.';
  }

  if (normalized.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists.';
  }

  if (normalized.includes('auth/invalid-email')) {
    return 'Enter a valid email address.';
  }

  if (normalized.includes('auth/weak-password') || normalized.includes('auth/password-does-not-meet-requirements')) {
    return 'Password does not meet the security requirements.';
  }

  if (normalized.includes('auth/too-many-requests')) {
    return 'Too many attempts. Please try again later.';
  }

  if (normalized.includes('permission-denied') || normalized.includes('missing or insufficient permissions')) {
    return 'Firestore permission denied. Make sure Firestore rules are deployed (firebase deploy --only firestore:rules).';
  }

  if (
    normalized.includes('auth/network-request-failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('network') ||
    normalized.includes('unavailable')
  ) {
    return 'Network error. Please try again.';
  }

  return message || fallback;
}

export function getFeedsAuthErrorResponse<T extends Record<string, unknown>>(
  extra?: T
): { success: false; error: string } & T {
  return {
    success: false,
    error: 'Session expired, please sign in again.',
    ...(extra || ({} as T)),
  };
}
