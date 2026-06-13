import { describe, expect, it } from 'vitest';
import {
  buildLinkedInContentSearchUrl,
  extractLinkedInMemberToken,
} from '../logic/feed-posts';

describe('feed posts search', () => {
  it('extracts member tokens from raw and full LinkedIn profile URNs', () => {
    expect(extractLinkedInMemberToken('ACoExample_123')).toBe('ACoExample_123');
    expect(
      extractLinkedInMemberToken('urn:li:fsd_profile:ACoAnother-456')
    ).toBe('ACoAnother-456');
    expect(extractLinkedInMemberToken('urn:li:member:123')).toBeNull();
  });

  it('builds the same deduplicated content search URL for every feed type', () => {
    const result = buildLinkedInContentSearchUrl([
      { profileUrn: 'urn:li:fsd_profile:ACoFirst' },
      { profileUrn: 'ACoSecond' },
      { profileUrn: 'urn:li:fsd_profile:ACoFirst' },
      { profileUrn: undefined },
    ]);

    expect(result).not.toBeNull();

    const url = new URL(result!);
    expect(url.origin + url.pathname).toBe(
      'https://www.linkedin.com/search/results/content/'
    );
    expect(url.searchParams.get('origin')).toBe('FACETED_SEARCH');
    expect(JSON.parse(url.searchParams.get('sortBy') || '[]')).toEqual([
      'date_posted',
    ]);
    expect(JSON.parse(url.searchParams.get('fromMember') || '[]')).toEqual([
      'ACoFirst',
      'ACoSecond',
    ]);
  });

  it('returns null when no LinkedIn member token is available', () => {
    expect(
      buildLinkedInContentSearchUrl([
        { profileUrn: undefined },
        { profileUrn: 'urn:li:member:123' },
      ])
    ).toBeNull();
  });
});
