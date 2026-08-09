import { describe, expect, it } from 'vitest';
import {
  extractConnectionsCountFromNetworkInfo,
  extractFollowersCountFromGraphql,
  extractFollowersCountFromNetworkInfo,
} from '../profile-analytics-linkedin-api';

describe('profile analytics LinkedIn API parsing', () => {
  it('prefers the precise My Network connection total over the public profile count', () => {
    const payload = {
      included: [{ connectionsCount: 500 }, { firstDegreeSize: 1_042 }],
    };

    expect(extractConnectionsCountFromNetworkInfo(payload)).toBe(1_042);
  });

  it('uses the direct network-info follower total when present', () => {
    const payload = {
      data: {
        followersCount: 34,
        followerSize: 80,
      },
    };

    expect(extractFollowersCountFromNetworkInfo(payload)).toBe(80);
  });

  it('reads the followers result-set total rather than the requested page size', () => {
    const payload = {
      data: {
        data: {
          searchDashClustersByAll: {
            metadata: { totalResultCount: 81 },
            paging: { start: 0, count: 10, total: 81 },
            elements: [{ totalResultCount: null }],
          },
        },
      },
      included: [
        {
          followerCount: 12_000,
          elements: [{ entityUrn: 'urn:li:fsd_profile:example' }],
        },
      ],
    };

    expect(extractFollowersCountFromGraphql(payload)).toBe(81);
  });

  it('does not treat unrelated GraphQL totals as the account follower total', () => {
    expect(
      extractFollowersCountFromGraphql({
        data: { data: { messagingDashAffiliatedMailboxesAll: { totalResultCount: 99 } } },
      })
    ).toBeUndefined();
  });
});
