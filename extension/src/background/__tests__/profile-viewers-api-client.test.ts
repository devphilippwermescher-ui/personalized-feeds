import { describe, expect, it } from 'vitest';
import { hasFreeProfileViewerLimit } from '../profile-viewers-api-client';

describe('Profile Visitors account limits', () => {
  it('recognizes LinkedIn free-account viewer copy', () => {
    expect(hasFreeProfileViewerLimit('Browse up to 3 viewers for free and unlock the full list with Premium')).toBe(
      true
    );
  });

  it('does not classify an ordinary Premium response as a free account', () => {
    expect(hasFreeProfileViewerLimit('Viewer details Profile viewers')).toBe(false);
  });
});
