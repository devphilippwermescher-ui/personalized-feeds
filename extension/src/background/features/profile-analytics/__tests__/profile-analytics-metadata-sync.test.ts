import { describe, expect, it } from 'vitest';
import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';
import { mergeProfileMetadataSnapshot } from '../profile-analytics-metadata-merge';

const current: ProfileAnalyticsProfileSnapshot = {
  linkedinUrl: 'https://www.linkedin.com/in/example/',
  linkedinUsername: 'example',
  displayName: 'Old Name',
  headline: 'Old headline',
  profileImageUrl: 'https://media.licdn.com/old-avatar',
  backgroundImageUrl: 'https://media.licdn.com/old-background',
  location: 'Old location',
  connectionsCount: 99,
  followersCount: 101,
  recentConnectionIds: ['known-id'],
  updatedAt: 1,
  sourceUrl: 'old-source',
};

describe('profile metadata merge', () => {
  it('updates only metadata and preserves volatile analytics values', () => {
    const result = mergeProfileMetadataSnapshot(
      current,
      {
        ...current,
        displayName: 'New Name',
        headline: 'New headline',
        location: 'Kyiv, Ukraine',
        profileImageUrl: 'https://media.licdn.com/new-avatar',
        backgroundImageUrl: 'https://media.licdn.com/new-background',
        sourceUrl: 'new-source',
      },
      { headline: true, profileImageUrl: true, backgroundImageUrl: true },
      2
    );

    expect(result).toMatchObject({
      displayName: 'New Name',
      headline: 'New headline',
      location: 'Kyiv, Ukraine',
      connectionsCount: 99,
      followersCount: 101,
      recentConnectionIds: ['known-id'],
    });
  });

  it('clears images only when LinkedIn observed those fields authoritatively', () => {
    const deleted = mergeProfileMetadataSnapshot(
      current,
      { ...current, headline: '', profileImageUrl: '', backgroundImageUrl: '', sourceUrl: 'new-source' },
      { headline: true, profileImageUrl: true, backgroundImageUrl: true },
      2
    );
    expect(deleted.headline).toBe('');
    expect(deleted.profileImageUrl).toBe('');
    expect(deleted.backgroundImageUrl).toBe('');

    const unobserved = mergeProfileMetadataSnapshot(
      current,
      { ...current, profileImageUrl: '', backgroundImageUrl: '', sourceUrl: 'new-source' },
      { headline: false, profileImageUrl: false, backgroundImageUrl: false },
      2
    );
    expect(unobserved.profileImageUrl).toBe(current.profileImageUrl);
    expect(unobserved.backgroundImageUrl).toBe(current.backgroundImageUrl);
  });
});
