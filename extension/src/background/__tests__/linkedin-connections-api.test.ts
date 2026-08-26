import { describe, expect, it } from 'vitest';
import { parseLinkedInConnectionsRscPage } from '../linkedin-connections-api';
import { collectConnectionsInLinkedInPage } from '../linkedin-connections-page-collector';

const russianConnectionsRsc = [
  '2:[{"modelStates":[{"key":{"key":{"value":{"$case":"id","id":"totalConnectionsCount"}}},"value":{"$case":"intValue","intValue":2}}]}]',
  '28:{"children":[{"componentKey":"ConnectionCard_0-first-user","children":["$L43","$L44","$L45"]},{"componentKey":"ConnectionCard_0-second-user","children":["$L47","$L48","$L49"]}]}',
  '43:{"url":"/in/first-user/"}',
  '45:{"textProps":{"children":["Контакт установлен 1 июля 2026 г."]}}',
  '47:{"url":"/in/second-user/"}',
  '49:{"textProps":{"children":["Контакт установлен 23 апреля 2026 г."]}}',
].join('\n');

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
      connectionRecords: [{ id: 'new-connection', connectedDate: '2026-08-04' }],
    });
  });

  it('keeps the authoritative first-page total when pagination contains 1 or 500', async () => {
    const payloads = [
      'x{"id":"totalConnectionsCount","value":{"intValue":1179}}' +
        '"url":"https://www.linkedin.com/in/first/" Connected on August 10, 2026',
      'x{"id":"totalConnectionsCount","value":{"intValue":1}}' +
        '"url":"https://www.linkedin.com/in/second/" Connected on August 9, 2026',
      'x{"id":"totalConnectionsCount","value":{"intValue":500}}' +
        '"url":"https://www.linkedin.com/in/third/" Connected on August 8, 2026',
    ];
    const originalFetch = window.fetch;
    window.fetch = async () => new Response(payloads.shift() || '', { status: 200 });

    try {
      const result = await collectConnectionsInLinkedInPage(
        'csrf',
        'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections',
        'https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=test',
        '{}',
        'pager',
        'sort',
        'namespace',
        'screen',
        3,
        0,
        [],
        0,
        10,
        0,
        1_000,
        5_000
      );

      expect(result.connectionsCount).toBe(1179);
      expect(result.connectionsCountExact).toBe(true);
      expect(result.pagesFetched).toBe(3);
    } finally {
      window.fetch = originalFetch;
    }
  });

  it('associates Russian localized dates with ConnectionCard Flight references', () => {
    expect(parseLinkedInConnectionsRscPage(russianConnectionsRsc)).toEqual({
      connectionsCount: 2,
      connectionDateCounts: {
        '2026-04-23': 1,
        '2026-07-01': 1,
      },
      nextStartIndex: undefined,
      connectionIds: ['first-user', 'second-user'],
      connectionRecords: [
        { id: 'first-user', connectedDate: '2026-07-01' },
        { id: 'second-user', connectedDate: '2026-04-23' },
      ],
    });
  });

  it('extracts calendar dates without depending on the surrounding LinkedIn label or fixed year', () => {
    const payload = [
      '2:{"modelStates":[{"key":{"key":{"value":{"$case":"id","id":"totalConnectionsCount"}}},"value":{"$case":"intValue","intValue":3}}]}',
      '28:{"children":[{"componentKey":"ConnectionCard_0-spanish-user","children":["$L41"]},{"componentKey":"ConnectionCard_0-german-user","children":["$L42"]},{"componentKey":"ConnectionCard_0-iso-user","children":["$L43"]}]}',
      '41:{"textProps":{"children":["La relación comenzó el 9 de agosto de 2024."]}}',
      '42:{"textProps":{"children":["Status: 17. März 2023"]}}',
      '43:{"textProps":{"children":["Recorded as 2022-11-07"]}}',
    ].join('\n');

    expect(parseLinkedInConnectionsRscPage(payload)).toEqual({
      connectionsCount: 3,
      connectionDateCounts: {
        '2022-11-07': 1,
        '2023-03-17': 1,
        '2024-08-09': 1,
      },
      nextStartIndex: undefined,
      connectionIds: ['spanish-user', 'german-user', 'iso-user'],
      connectionRecords: [
        { id: 'spanish-user', connectedDate: '2024-08-09' },
        { id: 'german-user', connectedDate: '2023-03-17' },
        { id: 'iso-user', connectedDate: '2022-11-07' },
      ],
    });
  });

  it('collects localized history from the RSC response before consulting the DOM', async () => {
    const originalFetch = window.fetch;
    const originalBody = document.body.innerHTML;
    const originalPath = window.location.pathname;
    window.history.replaceState({}, '', '/mynetwork/invite-connect/connections/');
    window.fetch = async () => new Response(russianConnectionsRsc, { status: 200 });
    document.body.innerHTML =
      '<div componentkey="ConnectionCard_0-dom-user"><a href="/in/dom-user/">DOM user</a>' +
      '<span>Контакт установлен 2 января 2026 г.</span></div>';

    try {
      const result = await collectConnectionsInLinkedInPage(
        'csrf',
        'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections',
        'https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=test',
        '{}',
        'pager',
        'sort',
        'namespace',
        'screen',
        1,
        0,
        [],
        0,
        10,
        0,
        1_000,
        5_000
      );

      expect(result.connectionRecords).toEqual([
        { id: 'first-user', connectedDate: '2026-07-01' },
        { id: 'second-user', connectedDate: '2026-04-23' },
      ]);
      expect(result.connectionDateCountsComplete).toBe(true);
      expect(result.paginationComplete).toBe(true);
    } finally {
      window.fetch = originalFetch;
      document.body.innerHTML = originalBody;
      window.history.replaceState({}, '', originalPath);
    }
  });

  it('falls back to the rendered Connections DOM when the RSC response has no usable rows', async () => {
    const originalFetch = window.fetch;
    const originalBody = document.body.innerHTML;
    const originalPath = window.location.pathname;
    window.history.replaceState({}, '', '/mynetwork/invite-connect/connections/');
    window.fetch = async () => new Response('response without usable connection rows or a total', { status: 200 });
    document.body.innerHTML =
      '<p>1 контакт</p><div componentkey="ConnectionCard_0-dom-user">' +
      '<a href="/in/dom-user/">DOM user</a><span>Контакт установлен 2 января 2026 г.</span></div>';

    try {
      const result = await collectConnectionsInLinkedInPage(
        'csrf',
        'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections',
        'https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=test',
        '{}',
        'pager',
        'sort',
        'namespace',
        'screen',
        1,
        0,
        [],
        0,
        10,
        0,
        1_000,
        5_000
      );

      expect(result.connectionRecords).toEqual([{ id: 'dom-user', connectedDate: '2026-01-02' }]);
      expect(result.connectionsCount).toBe(1);
      expect(result.connectionsCountExact).toBe(true);
      expect(result.connectionDateCounts).toEqual({ '2026-01-02': 1 });
      expect(result.paginationComplete).toBe(true);
    } finally {
      window.fetch = originalFetch;
      document.body.innerHTML = originalBody;
      window.history.replaceState({}, '', originalPath);
    }
  });

  it('stops incremental pagination at the first known connection id', async () => {
    const payloads = [
      'x{"id":"totalConnectionsCount","value":{"intValue":20}}' +
        '"url":"https://www.linkedin.com/in/new-user/" Connected on August 10, 2026',
      'x"url":"https://www.linkedin.com/in/known-user/" Connected on August 9, 2026',
    ];
    const originalFetch = window.fetch;
    window.fetch = async () => new Response(payloads.shift() || '', { status: 200 });

    try {
      const result = await collectConnectionsInLinkedInPage(
        'csrf',
        'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections',
        'https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=test',
        '{}',
        'pager',
        'sort',
        'namespace',
        'screen',
        3,
        0,
        ['known-user'],
        0,
        10,
        0,
        1_000,
        5_000
      );

      expect(result.boundaryFound).toBe(true);
      expect(result.pagesFetched).toBe(2);
      expect(result.newConnectionDateCounts).toEqual({ '2026-08-10': 1 });
    } finally {
      window.fetch = originalFetch;
    }
  });

  it('finishes pagination without treating undated rows as a request failure', async () => {
    const originalFetch = window.fetch;
    window.fetch = async () =>
      new Response(
        'x{"id":"totalConnectionsCount","value":{"intValue":2}}' +
          '"url":"https://www.linkedin.com/in/dated-user/" Connected on August 10, 2026',
        { status: 200 }
      );

    try {
      const result = await collectConnectionsInLinkedInPage(
        'csrf',
        'https://www.linkedin.com/flagship-web/mynetwork/invite-connect/connections',
        'https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=test',
        '{}',
        'pager',
        'sort',
        'namespace',
        'screen',
        1,
        0,
        [],
        0,
        10,
        0,
        1_000,
        5_000
      );

      expect(result.paginationComplete).toBe(true);
      expect(result.connectionRecords).toEqual([{ id: 'dated-user', connectedDate: '2026-08-10' }]);
      expect(result.connectionDateCountsComplete).toBe(false);
      expect(result.error).toBeUndefined();
    } finally {
      window.fetch = originalFetch;
    }
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
