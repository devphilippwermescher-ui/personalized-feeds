import { describe, expect, it } from 'vitest';
import { CREATOR_TOP_POSTS_QUERY_ID, createTopPostsUrl } from '../content-analytics-top-posts-api';

describe('createTopPostsUrl', () => {
  it('matches LinkedIn CREATOR_TOP_POSTS GraphQL variables', () => {
    const url = new URL(
      createTopPostsUrl({
        profileUrn: 'urn:li:fsd_profile:profile-id',
        range: {
          rangeKey: 'custom',
          linkedInRange: 'Custom',
          startDate: '2026-08-16',
          endDate: '2026-08-22',
          timeRange: 'past_7_days',
        },
        metricType: 'IMPRESSIONS',
      })
    );

    expect(url.searchParams.get('queryId')).toBe(CREATOR_TOP_POSTS_QUERY_ID);
    expect(url.searchParams.get('variables')).toBe(
      '(product:CREATOR_TOP_POSTS,targetEntityUrn:urn:li:fsd_profile:profile-id,' +
        'query:(selectedFilters:List(' +
        '(key:timeRange,value:List(past_7_days)),' +
        '(key:metricType,value:List(IMPRESSIONS)),' +
        '(key:startDate,value:List(2026-08-16)),' +
        '(key:endDate,value:List(2026-08-22)))))'
    );
  });
});
