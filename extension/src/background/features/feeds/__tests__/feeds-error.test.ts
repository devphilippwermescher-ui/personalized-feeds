import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeFeedsError } from '../errors/feeds-error';

describe('feeds authentication errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suggests registration without revealing whether an email exists', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(normalizeFeedsError({ code: 'auth/invalid-credential' })).toBe(
      "Incorrect email or password. Don't have an account? Sign up."
    );
    expect(normalizeFeedsError({ code: 'auth/user-not-found' })).toBe(
      "Incorrect email or password. Don't have an account? Sign up."
    );
  });

  it('replaces a disabled email provider error with an actionable message', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(normalizeFeedsError({ code: 'auth/operation-not-allowed' })).toBe(
      'Email sign-in is currently unavailable. Please use Google sign-in.'
    );
  });
});
