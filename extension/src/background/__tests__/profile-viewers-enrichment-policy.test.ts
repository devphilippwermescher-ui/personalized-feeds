import { describe, expect, it } from 'vitest';
import type { ProfileViewer, ProfileViewerInput } from 'shared/types';
import {
  hasCompleteProfileViewerIdentity,
  mapWithConcurrency,
  profileViewerNeedsEnrichment,
} from '../profile-viewers-enrichment-policy';

const validImage = 'https://media.licdn.com/dms/image/v2/test/profile-displayphoto-shrink_100_100/photo?e=4102444800';

function input(overrides: Partial<ProfileViewerInput> = {}): ProfileViewerInput {
  return {
    linkedinUrl: 'https://www.linkedin.com/in/test-user/',
    linkedinUsername: 'test-user',
    displayName: 'Test User',
    ...overrides,
  };
}

function existing(overrides: Partial<ProfileViewer> = {}): ProfileViewer {
  return {
    id: 'test-user',
    ...input({ profileImageUrl: validImage }),
    firstSeenAt: 1,
    lastSeenAt: 2,
    source: 'linkedin_profile_views',
    ...overrides,
  };
}

describe('profile viewer enrichment policy', () => {
  it('skips network enrichment for an existing complete profile', () => {
    expect(profileViewerNeedsEnrichment(input(), existing(), false)).toBe(false);
  });

  it('enriches new, incomplete, or ambiguous profiles', () => {
    expect(profileViewerNeedsEnrichment(input(), undefined, false)).toBe(true);
    expect(
      profileViewerNeedsEnrichment(
        input({ displayName: 'test-user' }),
        existing({ displayName: 'test-user', profileImageUrl: '' }),
        false
      )
    ).toBe(true);
    expect(profileViewerNeedsEnrichment(input(), existing(), true)).toBe(true);
  });

  it('recognizes when People Search data is sufficient without a profile-page request', () => {
    expect(hasCompleteProfileViewerIdentity(input({ profileImageUrl: validImage }))).toBe(true);
    expect(hasCompleteProfileViewerIdentity(input({ profileImageUrl: '' }))).toBe(false);
  });

  it('limits concurrency while preserving result order', async () => {
    let activeWorkers = 0;
    let maximumWorkers = 0;

    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      activeWorkers += 1;
      maximumWorkers = Math.max(maximumWorkers, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeWorkers -= 1;
      return value * 2;
    });

    expect(result).toEqual([2, 4, 6, 8]);
    expect(maximumWorkers).toBe(2);
  });
});
