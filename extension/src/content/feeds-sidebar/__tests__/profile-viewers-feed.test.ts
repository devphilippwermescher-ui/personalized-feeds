import { describe, expect, it } from 'vitest';
import type { ProfileViewerListItem } from 'shared/types';
import { buildProfileViewersState, PROFILE_VIEWERS_FEED_ID } from '../logic/profile-viewers-feed';

describe('buildProfileViewersState', () => {
  it('adds a recruiter aggregate row when LinkedIn reports recruiter viewers', () => {
    const state = buildProfileViewersState({
      viewers: [],
      summary: {
        privateViewerCount: 0,
        recruiterViewerCount: 32,
        recruiterViewerUrl:
          'https://www.linkedin.com/analytics/recruiter-views/?timeRange=WvmpSearchFilterTimeRange_LAST_90_DAYS',
        updatedAt: 123,
      },
      feeds: [],
      feedMembersById: {},
      currentUser: {
        userId: 'user-1',
        displayName: 'User',
        email: 'user@example.com',
        photoURL: '',
      },
      collectionProgress: {
        phase: 'private_summary',
        startedAt: 123,
      },
    });

    expect(state.members).toEqual([
      expect.objectContaining({
        id: '__profile_viewers_recruiters__',
        itemType: 'recruiterAggregate',
        displayName: '32 recruiters viewed your profile',
        linkedinUrl:
          'https://www.linkedin.com/analytics/recruiter-views/?timeRange=WvmpSearchFilterTimeRange_LAST_90_DAYS',
      }),
    ]);
    expect(state.feedMembersById[PROFILE_VIEWERS_FEED_ID]).toHaveLength(1);
    expect(state.feeds[0]).toEqual(
      expect.objectContaining({
        id: PROFILE_VIEWERS_FEED_ID,
        memberCount: 1,
        recruiterViewerCount: 32,
        profileViewersCollectionProgress: {
          phase: 'private_summary',
          startedAt: 123,
        },
      })
    );
  });

  it('omits anonymous profile viewer search segments from the feed', () => {
    const viewers: ProfileViewerListItem[] = [
      {
        id: 'meltem-soley',
        linkedinUrl: 'https://www.linkedin.com/in/meltem-soley/',
        linkedinUsername: 'meltem-soley',
        displayName: 'Meltem Soley',
        firstSeenAt: 100,
        lastSeenAt: 200,
        source: 'linkedin_profile_views',
      },
      {
        id: 'currentCompany%3D123',
        itemType: 'search',
        searchKey: 'currentCompany=123',
        searchUrl:
          'https://www.linkedin.com/search/results/people/?origin=WHO_VIEWED_ME&currentCompany=123',
        displayName: 'Someone at Example',
        keywords: '',
        currentCompany: '123',
        viewedAgoText: 'Viewed 6d ago',
        firstSeenAt: 100,
        lastSeenAt: 200,
        source: 'linkedin_profile_views',
      },
    ];

    const state = buildProfileViewersState({
      viewers,
      summary: null,
      feeds: [],
      feedMembersById: {},
      currentUser: {
        userId: 'user-1',
        displayName: 'User',
        email: 'user@example.com',
        photoURL: '',
      },
    });

    expect(state.members).toHaveLength(1);
    expect(state.members[0]).toEqual(
      expect.objectContaining({
        id: 'meltem-soley',
        itemType: 'profile',
        displayName: 'Meltem Soley',
      })
    );
    expect(state.feedMembersById[PROFILE_VIEWERS_FEED_ID]).toHaveLength(1);
    expect(state.feeds[0]).toEqual(
      expect.objectContaining({
        id: PROFILE_VIEWERS_FEED_ID,
        memberCount: 1,
      })
    );
  });
});
