import { describe, expect, it } from 'vitest';
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
      })
    );
  });
});
