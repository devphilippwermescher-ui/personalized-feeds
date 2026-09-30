import { describe, expect, it } from 'vitest';
import { validateProfileViewersRscPayload } from '../profile-viewers-response';

describe('validateProfileViewersRscPayload', () => {
  it('accepts a WVMP response even when it contains no named profiles', () => {
    const payload = `${'x'.repeat(100)}"requestId":"WvmpEntityList","paginationNeeded":false`;

    expect(validateProfileViewersRscPayload(payload)).toEqual({ valid: true });
  });

  it('classifies a LinkedIn authwall response as an authentication error', () => {
    const payload = `<html><body>${'x'.repeat(100)}Sign in to LinkedIn</body></html>`;

    expect(validateProfileViewersRscPayload(payload)).toEqual({
      valid: false,
      authRequired: true,
      reason: 'LinkedIn returned an authentication page instead of profile viewers data.',
    });
  });

  it('rejects a structurally unknown successful response', () => {
    const payload = JSON.stringify({ data: 'unexpected'.repeat(20) });

    expect(validateProfileViewersRscPayload(payload)).toEqual({
      valid: false,
      authRequired: false,
      reason: 'LinkedIn profile viewers response did not contain the expected WVMP structure.',
    });
  });
});
