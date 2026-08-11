import type { LinkedInConnectionsSnapshot } from './linkedin-connections-types';

/**
 * Runs in the LinkedIn tab's MAIN world. Keep this function self-contained:
 * Chrome serializes it and imported runtime values are unavailable there.
 */
export async function collectConnectionsInLinkedInPage(
  csrfToken: string,
  initialUrl: string,
  paginationBaseUrl: string,
  initialBody: string,
  pagerId: string,
  sortStateKey: string,
  sortNamespace: string,
  screenId: string,
  maxPages: number,
  knownConnectionIds: string[],
  paginationDelayMs: number,
  paginationBatchSize: number,
  paginationBatchCooldownMs: number,
  requestTimeoutMs: number,
  workTimeoutMs: number
): Promise<LinkedInConnectionsSnapshot> {
  const workStartedAt = Date.now();
  const dateCounts: Record<string, number> = {};
  const visitedStarts = new Set<number>();
  let url = initialUrl;
  let body = initialBody;
  let total: number | undefined;
  let expectedPages = maxPages;
  const knownIds = new Set(knownConnectionIds.map((value) => value.toLowerCase()));
  const recentConnectionIds: string[] = [];
  const randomHex = (size: number): string => {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  const trackingBytes = new Uint8Array(16);
  crypto.getRandomValues(trackingBytes);
  const trackingId = btoa(String.fromCharCode(...trackingBytes));
  const applicationInstanceBytes = new Uint8Array(16);
  crypto.getRandomValues(applicationInstanceBytes);
  const applicationInstance = btoa(String.fromCharCode(...applicationInstanceBytes));
  const pageForestId = randomHex(16);
  const traceSpanId = randomHex(8);
  let context: Record<string, string> = {
    'x-li-application-instance': applicationInstance,
    'x-li-application-version': '0.2.6621',
    'x-li-page-instance': `urn:li:page:d_flagship3_people_connections;${trackingId}`,
    'x-li-page-instance-tracking-id': trackingId,
    'x-li-pageforestid': pageForestId,
    'x-li-traceparent': `00-${pageForestId}-${traceSpanId}-00`,
    'x-li-tracestate': `LinkedIn=${traceSpanId}`,
    'x-li-track': JSON.stringify({
      clientVersion: '0.2.6621',
      mpVersion: '0.2.6621',
      osName: 'web',
      timezoneOffset: -new Date().getTimezoneOffset() / 60,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      deviceFormFactor: 'DESKTOP',
      mpName: 'web',
      displayDensity: window.devicePixelRatio || 1,
      displayWidth: window.screen.width,
      displayHeight: window.screen.height,
    }),
  };

  const addPageDates = (payload: string) => {
    const datePattern = /Connected on ([A-Z][a-z]+ \d{1,2}, \d{4})/g;
    for (const match of payload.matchAll(datePattern)) {
      const timestamp = Date.parse(`${match[1]} UTC`);
      if (Number.isFinite(timestamp)) {
        const key = new Date(timestamp).toISOString().slice(0, 10);
        dateCounts[key] = (dateCounts[key] || 0) + 1;
      }
    }
  };
  const addPageConnectionIds = (payload: string): string[] => {
    const datePattern = /Connected on ([A-Z][a-z]+ \d{1,2}, \d{4})/g;
    const ids = Array.from(
      new Set(
        Array.from(payload.matchAll(datePattern)).flatMap((dateMatch) => {
          const dateIndex = dateMatch.index || 0;
          const context = payload.slice(Math.max(0, dateIndex - 2_000), dateIndex + dateMatch[0].length + 200);
          const matches = Array.from(
            context.matchAll(/(?:https?:\\?\/\\?\/www\.linkedin\.com)?\\?\/in\\?\/([A-Za-z0-9_%.-]+)/g)
          );
          const rawId = matches[matches.length - 1]?.[1];
          if (!rawId) return [];
          try {
            return [decodeURIComponent(rawId).toLowerCase()];
          } catch {
            return [rawId.toLowerCase()];
          }
        })
      )
    );
    ids.forEach((id) => {
      if (!recentConnectionIds.includes(id) && recentConnectionIds.length < 50) recentConnectionIds.push(id);
    });
    return ids;
  };

  const createBody = (startIndex: number): string => {
    const requestedArguments = {
      $type: 'proto.sdui.actions.requests.RequestedArguments',
      requestedStateKeys: [
        {
          key: { value: { $case: 'id', id: sortStateKey } },
          namespace: sortNamespace,
        },
      ],
      payload: { startIndex, sortByOptionBinding: { key: sortStateKey, namespace: sortNamespace } },
      requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
    };
    return JSON.stringify({
      pagerId,
      clientArguments: {
        ...requestedArguments,
        states: [
          {
            key: sortStateKey,
            namespace: sortNamespace,
            value: 'sortByRecentlyAdded',
            originalProtoCase: 'stringValue',
          },
        ],
        screenId,
      },
      paginationRequest: {
        $type: 'proto.sdui.actions.requests.PaginationRequest',
        pagerId,
        requestedArguments,
        trigger: {
          $case: 'itemDistanceTrigger',
          itemDistanceTrigger: {
            $type: 'proto.sdui.actions.requests.ItemDistanceTrigger',
            preloadDistance: 3,
            preloadLength: 250,
          },
        },
        retryCount: 2,
      },
    });
  };

  try {
    for (let page = 0; page < maxPages; page += 1) {
      if (Date.now() - workStartedAt >= workTimeoutMs) {
        throw new Error(`LinkedIn connections tab work timed out after ${workTimeoutMs}ms`);
      }
      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, requestTimeoutMs);
      let response: Response;
      let payload: string;
      try {
        response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            accept: '*/*',
            'content-type': 'application/json',
            'csrf-token': csrfToken,
            'x-li-anchor-page-key': 'd_flagship3_people_connections',
            'x-li-rsc-stream': 'true',
            ...context,
          },
          body,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`LinkedIn pagination request failed with ${response.status}`);
        payload = await response.text();
      } catch (error) {
        if (timedOut) throw new Error(`LinkedIn connections request timed out after ${requestTimeoutMs}ms`);
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
      }

      context = {
        ...context,
        ...(response.headers.get('x-li-application-instance')
          ? { 'x-li-application-instance': response.headers.get('x-li-application-instance') as string }
          : {}),
        ...(response.headers.get('x-li-application-version')
          ? { 'x-li-application-version': response.headers.get('x-li-application-version') as string }
          : {}),
        ...(response.headers.get('x-li-page-instance')
          ? { 'x-li-page-instance': response.headers.get('x-li-page-instance') as string }
          : {}),
        ...(response.headers.get('x-li-page-instance-tracking-id')
          ? { 'x-li-page-instance-tracking-id': response.headers.get('x-li-page-instance-tracking-id') as string }
          : {}),
        ...(response.headers.get('x-li-pageforestid')
          ? { 'x-li-pageforestid': response.headers.get('x-li-pageforestid') as string }
          : {}),
      };
      addPageDates(payload);
      const pageConnectionIds = addPageConnectionIds(payload);
      const totalMatch =
        payload.match(
          /"id"\s*:\s*"totalConnectionsCount"[\s\S]{0,500}?"(?:intValue|longValue|stringValue)"\s*:\s*"?([\d,]+)"?/
        ) || payload.match(/\b([\d,]+)\s+connections\b/i);
      const pageTotal = Number(totalMatch?.[1]?.replace(/,/g, ''));
      if (page === 0 && Number.isSafeInteger(pageTotal)) {
        total = pageTotal;
        expectedPages = Math.min(maxPages, Math.max(1, Math.ceil(pageTotal / 10)));
      }
      if (page + 1 >= expectedPages) break;
      if (pageConnectionIds.some((id) => knownIds.has(id))) break;

      const nextRequestIndex = payload.indexOf('"nextPageRequest"');
      const nextContext = nextRequestIndex >= 0 ? payload.slice(nextRequestIndex, nextRequestIndex + 2_000) : '';
      const responseStartIndex = Number(nextContext.match(/"startIndex":(\d+)/)?.[1]);
      const nextStart =
        Number.isSafeInteger(responseStartIndex) && responseStartIndex > 0 ? responseStartIndex : (page + 1) * 10;
      if (visitedStarts.has(nextStart)) {
        throw new Error('LinkedIn returned a repeated connection page cursor.');
      }
      visitedStarts.add(nextStart);
      const delay =
        paginationBatchSize > 0 && (page + 1) % paginationBatchSize === 0
          ? paginationBatchCooldownMs
          : paginationDelayMs;
      if (delay > 0) {
        const remainingWorkMs = workTimeoutMs - (Date.now() - workStartedAt);
        if (remainingWorkMs <= 0) {
          throw new Error(`LinkedIn connections tab work timed out after ${workTimeoutMs}ms`);
        }
        await new Promise((resolve) => window.setTimeout(resolve, Math.min(delay, remainingWorkMs)));
      }
      const spanBytes = new Uint8Array(8);
      crypto.getRandomValues(spanBytes);
      const parentSpanId = btoa(String.fromCharCode(...spanBytes));
      url = `${paginationBaseUrl}&parentSpanId=${encodeURIComponent(parentSpanId)}`;
      body = createBody(nextStart);
    }
  } catch (error) {
    return {
      connectionsCount: total,
      connectionDateCounts: dateCounts,
      connectionDateCountsComplete: false,
      ...(recentConnectionIds.length > 0 ? { recentConnectionIds } : {}),
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const collected = Object.values(dateCounts).reduce((sum, count) => sum + count, 0);
  const connectionDateCountsComplete = typeof total === 'number' && collected === total;
  return {
    connectionsCount: total,
    connectionDateCounts: dateCounts,
    connectionDateCountsComplete,
    ...(recentConnectionIds.length > 0 ? { recentConnectionIds } : {}),
    ...(typeof total === 'number' && !connectionDateCountsComplete
      ? { error: `LinkedIn returned ${collected} dated connections out of ${total}.` }
      : {}),
  };
}
