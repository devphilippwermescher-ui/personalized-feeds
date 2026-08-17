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
  startIndex: number,
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
  const knownIds = new Set(knownConnectionIds.map((value) => value.toLowerCase()));
  const recentConnectionIds: string[] = [];
  const connectionRecordsById = new Map<string, { id: string; connectedDate: string }>();
  const newConnectionDateCounts: Record<string, number> = {};
  let boundaryFound = false;
  let paginationComplete = false;
  let nextStartIndex: number | undefined = startIndex > 0 ? startIndex : undefined;
  let pagesFetched = 0;
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

  const dateLocales = [
    document.documentElement.lang,
    ...navigator.languages,
    'en',
    'ru',
    'uk',
    'de',
    'fr',
    'es',
    'it',
    'pt',
    'nl',
    'pl',
    'cs',
    'da',
    'fi',
    'hu',
    'nb',
    'ro',
    'sv',
    'tr',
    'id',
    'ms',
    'vi',
    'hi',
    'ar',
    'th',
  ].filter(Boolean);
  const normalizeMonthToken = (value: string): string =>
    value
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{M}]/gu, '');
  const monthLookup = new Map<string, number>();
  for (const locale of Array.from(new Set(dateLocales))) {
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(Date.UTC(2020, month, 15));
      for (const width of ['long', 'short'] as const) {
        try {
          const standalone = new Intl.DateTimeFormat(locale, {
            month: width,
            timeZone: 'UTC',
          }).format(date);
          const contextual = new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: width,
            year: 'numeric',
            timeZone: 'UTC',
          })
            .formatToParts(date)
            .find((part) => part.type === 'month')?.value;
          [standalone, contextual].forEach((candidate) => {
            const token = normalizeMonthToken(candidate || '');
            if (token.length >= 2) monthLookup.set(token, month);
          });
        } catch {
          // Ignore a locale unsupported by the current browser runtime.
        }
      }
    }
  }
  const toDateKey = (year: number, month: number, day: number): string | undefined => {
    if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day)) return undefined;
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
      return undefined;
    }
    return date.toISOString().slice(0, 10);
  };
  const readDateOccurrences = (value: string): Array<{ index: number; date: string }> => {
    const occurrences = new Map<string, { index: number; date: string }>();
    const addOccurrence = (index: number, year: number, month: number, day: number) => {
      const date = toDateKey(year, month, day);
      if (date) occurrences.set(`${index}:${date}`, { index, date });
    };

    for (const match of value.matchAll(/(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/g)) {
      addOccurrence(match.index || 0, Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    for (const match of value.matchAll(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/g)) {
      const first = Number(match[1]);
      const second = Number(match[2]);
      if (first > 12) addOccurrence(match.index || 0, Number(match[3]), second - 1, first);
      else if (second > 12) addOccurrence(match.index || 0, Number(match[3]), first - 1, second);
    }
    for (const match of value.matchAll(
      /(?<!\d)(\d{4})\s*(?:年|년)\s*(\d{1,2})\s*(?:月|월)\s*(\d{1,2})\s*(?:日|일)?/gu
    )) {
      addOccurrence(match.index || 0, Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    for (const yearMatch of value.matchAll(/(?<!\d)(\d{4})(?!\d)/g)) {
      const yearIndex = yearMatch.index || 0;
      const windowStart = Math.max(0, yearIndex - 48);
      const windowEnd = Math.min(value.length, yearIndex + yearMatch[0].length + 40);
      const windowText = value.slice(windowStart, windowEnd);
      const monthCandidates = Array.from(windowText.matchAll(/[\p{L}\p{M}][\p{L}\p{M}.'’-]*/gu))
        .map((match) => ({
          start: windowStart + (match.index || 0),
          end: windowStart + (match.index || 0) + match[0].length,
          month: monthLookup.get(normalizeMonthToken(match[0])),
        }))
        .filter(
          (candidate): candidate is { start: number; end: number; month: number } => typeof candidate.month === 'number'
        )
        .sort(
          (left, right) =>
            Math.min(Math.abs(left.start - yearIndex), Math.abs(left.end - yearIndex)) -
            Math.min(Math.abs(right.start - yearIndex), Math.abs(right.end - yearIndex))
        );
      const monthCandidate = monthCandidates[0];
      if (!monthCandidate) continue;
      const dayCandidates = Array.from(windowText.matchAll(/(?<!\d)(\d{1,2})(?!\d)/g))
        .map((match) => ({
          start: windowStart + (match.index || 0),
          end: windowStart + (match.index || 0) + match[0].length,
          day: Number(match[1]),
        }))
        .filter(
          (candidate) =>
            candidate.day >= 1 &&
            candidate.day <= 31 &&
            !(candidate.start >= yearIndex && candidate.end <= yearIndex + yearMatch[0].length)
        )
        .map((candidate) => ({
          ...candidate,
          distance:
            candidate.end <= monthCandidate.start
              ? monthCandidate.start - candidate.end
              : candidate.start >= monthCandidate.end
                ? candidate.start - monthCandidate.end
                : Number.POSITIVE_INFINITY,
        }))
        .filter((candidate) => candidate.distance <= 16)
        .sort((left, right) => left.distance - right.distance);
      const dayCandidate = dayCandidates[0];
      if (!dayCandidate) continue;
      addOccurrence(
        Math.min(monthCandidate.start, dayCandidate.start),
        Number(yearMatch[1]),
        monthCandidate.month,
        dayCandidate.day
      );
    }

    return Array.from(occurrences.values()).sort((left, right) => left.index - right.index);
  };
  const normalizeConnectionId = (rawId: string): string => {
    try {
      return decodeURIComponent(rawId).toLowerCase();
    } catch {
      return rawId.toLowerCase();
    }
  };
  const readPageRecords = (payload: string): Array<{ id: string; connectedDate: string }> => {
    const records = new Map<string, { id: string; connectedDate: string }>();
    const dateOccurrences = readDateOccurrences(payload);
    const dateByFlightReference = new Map<string, string>();
    payload.split(/\r?\n/).forEach((line) => {
      const reference = line.match(/^([0-9a-f]+):/i)?.[1]?.toLowerCase();
      const date = readDateOccurrences(line)[0]?.date;
      if (reference && date) dateByFlightReference.set(reference, date);
    });

    const cardPattern = /"componentKey":"ConnectionCard_0-([A-Za-z0-9_%.-]+)"/g;
    const cardMatches = Array.from(payload.matchAll(cardPattern));
    cardMatches.forEach((cardMatch, index) => {
      const start = cardMatch.index || 0;
      const lineEndIndex = payload.indexOf('\n', start);
      const lineEnd = lineEndIndex >= 0 ? lineEndIndex : payload.length;
      const nextCardStart = cardMatches[index + 1]?.index;
      const end = typeof nextCardStart === 'number' && nextCardStart < lineEnd ? nextCardStart : lineEnd;
      const cardContext = payload.slice(start, end);
      const dateReference = Array.from(cardContext.matchAll(/\$L([0-9a-f]+)/gi))
        .map((match) => match[1].toLowerCase())
        .find((reference) => dateByFlightReference.has(reference));
      const connectedDate = dateReference ? dateByFlightReference.get(dateReference) : undefined;
      if (!connectedDate) return;
      const id = normalizeConnectionId(cardMatch[1]);
      if (!records.has(id)) records.set(id, { id, connectedDate });
    });

    dateOccurrences.forEach((occurrence) => {
      const itemContext = payload.slice(Math.max(0, occurrence.index - 12_000), occurrence.index + 500);
      const profileUrlMatches = Array.from(
        itemContext.matchAll(/(?:https?:\\?\/\\?\/www\.linkedin\.com)?\\?\/in\\?\/([A-Za-z0-9_%.-]+)/g)
      );
      const profileImageMatches = Array.from(
        itemContext.matchAll(/ConnectionCardProfileImage_\d+-([A-Za-z0-9_%.-]+)/g)
      );
      const rawId =
        profileUrlMatches[profileUrlMatches.length - 1]?.[1] ||
        profileImageMatches[profileImageMatches.length - 1]?.[1];
      if (!rawId) return;
      const id = normalizeConnectionId(rawId);
      if (!records.has(id)) records.set(id, { id, connectedDate: occurrence.date });
    });

    return Array.from(records.values());
  };

  const readDomSnapshot = (): {
    total?: number;
    rowCount: number;
    records: Array<{ id: string; connectedDate: string }>;
  } => {
    if (!window.location.pathname.startsWith('/mynetwork/invite-connect/connections')) {
      return { rowCount: 0, records: [] };
    }

    const records = new Map<string, { id: string; connectedDate: string }>();
    const rowIds = new Set<string>();
    const cardElements = Array.from(document.querySelectorAll<HTMLElement>('[componentkey^="ConnectionCard_0-"]'));
    cardElements.forEach((card) => {
      const rawId = card.getAttribute('componentkey')?.replace(/^ConnectionCard_\d+-/, '');
      if (!rawId) return;
      const id = normalizeConnectionId(rawId);
      rowIds.add(id);
      const connectedDate = readDateOccurrences(card.innerText || card.textContent || '')[0]?.date;
      if (connectedDate && !records.has(id)) records.set(id, { id, connectedDate });
    });

    // Keep a conservative fallback for DOM revisions that remove the
    // componentkey attribute but retain profile links and the visible date.
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]').forEach((anchor) => {
      const rawId = anchor.href.match(/\/in\/([A-Za-z0-9_%.-]+)/)?.[1];
      if (!rawId) return;
      let container: HTMLElement | null = anchor;
      let connectedDate: string | undefined;
      for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
        if (container.querySelectorAll('a[href*="/in/"]').length > 1) break;
        connectedDate = readDateOccurrences(container.innerText || container.textContent || '')[0]?.date;
        if (connectedDate) break;
      }
      if (!connectedDate) return;
      const id = normalizeConnectionId(rawId);
      rowIds.add(id);
      if (!records.has(id)) records.set(id, { id, connectedDate });
    });

    const pageText = document.body.innerText || document.body.textContent || '';
    const totalText =
      pageText.match(/\b([\d\s,.]+)\s+connections\b/i)?.[1] ||
      pageText.match(/\b([\d\s,.]+)\s+контакт(?:а|ов)?(?![\p{L}\p{N}_])/iu)?.[1];
    const parsedTotal = Number(totalText?.replace(/\D/g, ''));
    return {
      total: Number.isSafeInteger(parsedTotal) ? parsedTotal : undefined,
      rowCount: rowIds.size,
      records: Array.from(records.values()),
    };
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
    let currentStartIndex = 0;
    while (pagesFetched < maxPages) {
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
      const totalMatch =
        payload.match(
          /"id"\s*:\s*"totalConnectionsCount"[\s\S]{0,500}?"(?:intValue|longValue|stringValue)"\s*:\s*"?([\d,]+)"?/
        ) || payload.match(/\b([\d,]+)\s+connections\b/i);
      const pageTotal = Number(totalMatch?.[1]?.replace(/,/g, ''));
      if (currentStartIndex === 0 && Number.isSafeInteger(pageTotal)) {
        total = pageTotal;
      }

      // A resumed batch fetches the initial page only to establish request
      // context and refresh the authoritative total. Its records were already
      // checkpointed by the first batch and must not be counted twice.
      if (startIndex > 0 && currentStartIndex === 0) {
        if (typeof total === 'number' && startIndex >= total) {
          paginationComplete = true;
          nextStartIndex = undefined;
          break;
        }
        currentStartIndex = startIndex;
        nextStartIndex = startIndex;
        const spanBytes = new Uint8Array(8);
        crypto.getRandomValues(spanBytes);
        const parentSpanId = btoa(String.fromCharCode(...spanBytes));
        url = `${paginationBaseUrl}&parentSpanId=${encodeURIComponent(parentSpanId)}`;
        body = createBody(startIndex);
        continue;
      }

      pagesFetched += 1;
      const responseRecords = readPageRecords(payload);
      const domSnapshot = responseRecords.length === 0 && currentStartIndex === 0 ? readDomSnapshot() : undefined;
      if (typeof total !== 'number' && typeof domSnapshot?.total === 'number') total = domSnapshot.total;
      const pageRecords = responseRecords.length > 0 ? responseRecords : domSnapshot?.records || [];
      for (const record of pageRecords) {
        if (knownIds.has(record.id)) {
          boundaryFound = true;
          break;
        }
        const isNewRecord = !connectionRecordsById.has(record.id);
        if (isNewRecord) {
          connectionRecordsById.set(record.id, record);
          dateCounts[record.connectedDate] = (dateCounts[record.connectedDate] || 0) + 1;
        }
        if (!recentConnectionIds.includes(record.id) && recentConnectionIds.length < 100) {
          recentConnectionIds.push(record.id);
        }
        if (isNewRecord) {
          newConnectionDateCounts[record.connectedDate] = (newConnectionDateCounts[record.connectedDate] || 0) + 1;
        }
      }
      if (boundaryFound) break;

      const nextRequestIndex = payload.indexOf('"nextPageRequest"');
      const nextContext = nextRequestIndex >= 0 ? payload.slice(nextRequestIndex, nextRequestIndex + 2_000) : '';
      const responseStartIndex = Number(nextContext.match(/"startIndex":(\d+)/)?.[1]);
      const nextStart =
        currentStartIndex === 0 && Number.isSafeInteger(responseStartIndex) && responseStartIndex > 0
          ? responseStartIndex
          : currentStartIndex + 10;
      if (typeof total === 'number' && nextStart >= total) {
        paginationComplete = true;
        nextStartIndex = undefined;
        break;
      }
      if (visitedStarts.has(nextStart)) {
        throw new Error('LinkedIn returned a repeated connection page cursor.');
      }
      visitedStarts.add(nextStart);
      nextStartIndex = nextStart;
      if (pagesFetched >= maxPages) break;
      const delay =
        paginationBatchSize > 0 && pagesFetched % paginationBatchSize === 0
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
      currentStartIndex = nextStart;
    }
  } catch (error) {
    const domSnapshot = connectionRecordsById.size === 0 ? readDomSnapshot() : undefined;
    if (typeof total !== 'number' && typeof domSnapshot?.total === 'number') total = domSnapshot.total;
    domSnapshot?.records.forEach((record) => {
      if (connectionRecordsById.has(record.id)) return;
      connectionRecordsById.set(record.id, record);
      dateCounts[record.connectedDate] = (dateCounts[record.connectedDate] || 0) + 1;
      newConnectionDateCounts[record.connectedDate] = (newConnectionDateCounts[record.connectedDate] || 0) + 1;
      if (recentConnectionIds.length < 100) recentConnectionIds.push(record.id);
    });
    const domCoversAllRows =
      typeof total === 'number' && typeof domSnapshot?.rowCount === 'number' && domSnapshot.rowCount >= total;
    return {
      connectionsCount: total,
      connectionsCountExact: typeof total === 'number',
      connectionDateCounts: dateCounts,
      connectionDateCountsComplete:
        domCoversAllRows && Object.values(dateCounts).reduce((sum, count) => sum + count, 0) === total,
      newConnectionDateCounts,
      boundaryFound,
      nextStartIndex: domCoversAllRows ? undefined : nextStartIndex,
      paginationComplete: domCoversAllRows,
      pagesFetched,
      connectionRecords: Array.from(connectionRecordsById.values()),
      ...(recentConnectionIds.length > 0 ? { recentConnectionIds } : {}),
      ...(domCoversAllRows ? {} : { error: error instanceof Error ? error.message : String(error) }),
    };
  }

  const collected = Object.values(dateCounts).reduce((sum, count) => sum + count, 0);
  const connectionDateCountsComplete = typeof total === 'number' && collected === total;
  return {
    connectionsCount: total,
    connectionsCountExact: typeof total === 'number',
    connectionDateCounts: dateCounts,
    connectionDateCountsComplete,
    newConnectionDateCounts,
    boundaryFound,
    nextStartIndex,
    paginationComplete,
    pagesFetched,
    connectionRecords: Array.from(connectionRecordsById.values()),
    ...(recentConnectionIds.length > 0 ? { recentConnectionIds } : {}),
  };
}
