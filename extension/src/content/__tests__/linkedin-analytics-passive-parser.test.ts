import { describe, expect, it } from 'vitest';
import { parsePassiveAnalyticsResponse } from '../linkedin-analytics-passive-parser';

describe('LinkedIn analytics passive response parsing', () => {
  it('captures the exact connections total from LinkedIn RSC', () => {
    const result = parsePassiveAnalyticsResponse(
      'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections',
      'x{"id":"totalConnectionsCount","value":{"intValue":86}}y',
      100
    );
    expect(result).toMatchObject({ connectionsCount: 86, capturedAt: 100 });
  });

  it('captures a connections total from a My Network server-request response', () => {
    const result = parsePassiveAnalyticsResponse(
      'https://www.linkedin.com/flagship-web/rsc-action/actions/server-request?sduiid=mynetwork.connectionsList',
      'x{"id": "totalConnectionsCount", "value":{"longValue":"1,086"}}y',
      150
    );
    expect(result).toMatchObject({ connectionsCount: 1_086, capturedAt: 150 });
  });

  it('captures the followers search result total', () => {
    const result = parsePassiveAnalyticsResponse(
      'https://www.linkedin.com/voyager/api/graphql?variables=FOLLOWERS',
      '{"metadata":{"totalResultCount":86},"paging":{"total":80}}',
      200
    );
    expect(result).toMatchObject({ followersCount: 86, capturedAt: 200 });
  });

  it("uses LinkedIn's visible follower total when the normalized response only contains that text", () => {
    const result = parsePassiveAnalyticsResponse(
      'https://www.linkedin.com/voyager/api/graphql?variables=FOLLOWERS',
      '{"text":"1,286 people are following you"}',
      250
    );
    expect(result).toMatchObject({ followersCount: 1_286, capturedAt: 250 });
  });

  it('ignores unrelated LinkedIn responses', () => {
    expect(parsePassiveAnalyticsResponse('https://www.linkedin.com/voyager/api/messaging', '{"total":86}')).toBeNull();
  });
});
