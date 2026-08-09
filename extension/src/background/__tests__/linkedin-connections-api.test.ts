import { describe, expect, it } from 'vitest';
import { parseLinkedInConnectionsRscPage } from '../linkedin-connections-api';

describe('LinkedIn connections RSC parsing', () => {
  it('extracts the exact total, connection dates, and API pagination cursor', () => {
    const payload = [
      '2:["$","$L5",null,{"modelStates":[',
      '{"key":{"key":{"value":{"$case":"id","id":"totalConnectionsCount"}}},"namespace":""},',
      '"value":{"$case":"intValue","intValue":81}}]}]',
      '83:["$","p",null,{"children":["Connected on August 4, 2026"]}]',
      '84:{"url":"https://www.linkedin.com/in/new-connection/"}',
      '84:["$","p",null,{"children":["Connected on August 4, 2026"]}]',
      '85:["$","p",null,{"children":["Connected on August 4, 2026"]}]',
      '86:["$","p",null,{"children":["Connected on August 3, 2026"]}]',
      '"nextPageRequest":{"requestedArguments":{"payload":{"startIndex":10}}}',
    ].join('');

    expect(parseLinkedInConnectionsRscPage(payload)).toEqual({
      connectionsCount: 81,
      connectionDateCounts: {
        '2026-08-03': 1,
        '2026-08-04': 3,
      },
      nextStartIndex: 10,
      connectionIds: ['new-connection'],
    });
  });

  it('allows pagination responses without a repeated nextPageRequest', () => {
    const page = parseLinkedInConnectionsRscPage('2:["$","p",null,{"children":["Connected on July 29, 2026"]}]');

    expect(page).toEqual({
      connectionsCount: undefined,
      connectionDateCounts: { '2026-07-29': 1 },
      nextStartIndex: undefined,
    });
  });

  it.each([
    ['longValue', '"id" : "totalConnectionsCount", "value":{"longValue":86}', 86],
    ['stringValue', '"id":"totalConnectionsCount","value":{"stringValue":"1,286"}', 1286],
    ['rendered text', 'Oleksandr Network · 86 connections', 86],
  ])('extracts the exact total from %s responses', (_kind, payload, expected) => {
    expect(parseLinkedInConnectionsRscPage(payload).connectionsCount).toBe(expected);
  });

  it('does not treat a pagination UI expression as the exact connection total', () => {
    const page = parseLinkedInConnectionsRscPage(
      '"id":"totalConnectionsCount"}}},"b":{"expression":{"$case":"intExpression",' + '"intValue":1}}'
    );

    expect(page.connectionsCount).toBe(1);
    // fetchLinkedInConnectionsSnapshot intentionally consumes this number only
    // on page zero, where LinkedIn supplies the true total.
  });
});
