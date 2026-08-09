import { describe, expect, it } from 'vitest';
import {
  extractFollowersHistoryFromAnalyticsRsc,
  extractFollowersTotalFromAnalyticsRsc,
} from '../../linkedin/followers-analytics-rsc-parser';

describe('LinkedIn Audience Analytics followers RSC parsing', () => {
  it('resolves the numeric value paired with the Total followers label', () => {
    const payload = [
      '0:["$","div",null,{"children":["$Lb","$Lc"]}]',
      'b:["$","Text",null,{"textProps":{"fontSize":"2xlarge","children":["83"]}}]',
      'c:["$","Text",null,{"textProps":{"fontSize":"small","children":["Total followers"]}}]',
    ].join('\n');

    expect(extractFollowersTotalFromAnalyticsRsc(payload)).toBe(83);
  });

  it('extracts the 365-day cumulative follower series', () => {
    const payload =
      '13:["$","Chart",null,{"series":[{"name":"New followers","data":[' +
      '{"y":44,"tooltipPercentageText":null,"x":1782864000000},' +
      '{"y":86,"tooltipPercentageText":null,"x":1785974400000}],"dashStyle":"Solid"}]}]';

    expect(extractFollowersHistoryFromAnalyticsRsc(payload)).toEqual([
      { date: '2026-07-01', count: 44 },
      { date: '2026-08-06', count: 86 },
    ]);
  });

  it('supports formatted totals', () => {
    const payload = [
      '0:["$","div",null,{"children":["$L1a","$L1b"]}]',
      '1a:["$","Text",null,{"textProps":{"fontSize":"2xlarge","children":["1,234"]}}]',
      '1b:["$","Text",null,{"textProps":{"children":["Total followers"]}}]',
    ].join('\n');

    expect(extractFollowersTotalFromAnalyticsRsc(payload)).toBe(1_234);
  });

  it('uses the large numeric total as a localized-label fallback', () => {
    const payload =
      'a:["$","Text",null,{"textProps":{"fontSize":"2xlarge","children":["91"]}}]\n' +
      'b:["$","Text",null,{"textProps":{"children":["Усього читачів"]}}]';

    expect(extractFollowersTotalFromAnalyticsRsc(payload)).toBe(91);
  });

  it('does not guess when no total is present', () => {
    expect(extractFollowersTotalFromAnalyticsRsc('0:["$","div",null,{}]')).toBeUndefined();
  });
});
