import { describe, expect, it } from 'vitest';
import type { UserFeatureSettings } from 'shared/types';
import { getVisibleSidebarFeeds } from '../logic/sidebar-render';
import type { FeedInfo } from '../types';

const defaultSettings: UserFeatureSettings = {
  messagingButtons: true,
  postButtons: true,
  speechToComment: true,
  hideProfileViewers: false,
};

const feeds: FeedInfo[] = [
  {
    id: 'profile-viewers',
    name: 'Profile Visitors',
    color: '#eef6ff',
    memberCount: 8,
    isSystem: true,
    systemType: 'profileViewers',
  },
  {
    id: 'work',
    name: 'Work',
    color: '#615DEC',
    memberCount: 3,
  },
];

describe('Profile Visitors sidebar visibility', () => {
  it('shows Profile Visitors by default', () => {
    expect(getVisibleSidebarFeeds(feeds, defaultSettings, '').map((feed) => feed.id)).toEqual([
      'profile-viewers',
      'work',
    ]);
  });

  it('hides only Profile Visitors when the setting is enabled', () => {
    expect(
      getVisibleSidebarFeeds(
        feeds,
        {
          ...defaultSettings,
          hideProfileViewers: true,
        },
        ''
      ).map((feed) => feed.id)
    ).toEqual(['work']);
  });
});
