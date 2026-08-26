import type { LinkedInConnectionRecord, LinkedInConnectionsRscPage } from './linkedin-connections-types';
import { readConnectionDateOccurrences, type ConnectionDateOccurrence } from './linkedin-connection-date-parser';

function normalizeConnectionId(rawId: string): string {
  try {
    return decodeURIComponent(rawId).toLowerCase();
  } catch {
    return rawId.toLowerCase();
  }
}

function extractConnectionRecords(
  payload: string,
  dateOccurrences: ConnectionDateOccurrence[]
): LinkedInConnectionRecord[] {
  const recordsById = new Map<string, LinkedInConnectionRecord>();
  const dateByFlightReference = new Map<string, string>();
  payload.split(/\r?\n/).forEach((line) => {
    const reference = line.match(/^([0-9a-f]+):/i)?.[1]?.toLowerCase();
    const date = readConnectionDateOccurrences(line)[0]?.date;
    if (reference && date) dateByFlightReference.set(reference, date);
  });

  // Current SDUI responses keep card structure and localized date text in
  // separate React Flight rows. Associate them through the `$Lxx` references
  // instead of relying on the physical distance between an /in/ URL and date.
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
    if (!recordsById.has(id)) recordsById.set(id, { id, connectedDate });
  });

  // Legacy and simplified responses place an /in/ URL close to the date.
  // Keep this fallback for older LinkedIn response shapes and unit fixtures.
  dateOccurrences.forEach((occurrence) => {
    const context = payload.slice(Math.max(0, occurrence.index - 12_000), occurrence.index + 500);
    const profileUrlMatches = Array.from(
      context.matchAll(/(?:https?:\\?\/\\?\/www\.linkedin\.com)?\\?\/in\\?\/([A-Za-z0-9_%.-]+)/g)
    );
    const profileImageMatches = Array.from(context.matchAll(/ConnectionCardProfileImage_\d+-([A-Za-z0-9_%.-]+)/g));
    const rawId =
      profileUrlMatches[profileUrlMatches.length - 1]?.[1] || profileImageMatches[profileImageMatches.length - 1]?.[1];
    if (!rawId) return;
    const id = normalizeConnectionId(rawId);
    if (!recordsById.has(id)) recordsById.set(id, { id, connectedDate: occurrence.date });
  });

  return Array.from(recordsById.values());
}

export function parseLinkedInConnectionsRscPage(payload: string): LinkedInConnectionsRscPage {
  const connectionsCountMatch =
    payload.match(
      /"id"\s*:\s*"totalConnectionsCount"[\s\S]{0,500}?"(?:intValue|longValue|stringValue)"\s*:\s*"?([\d,]+)"?/
    ) || payload.match(/\b([\d,]+)\s+connections\b/i);
  const connectionDateCounts: Record<string, number> = {};
  const dateOccurrences = readConnectionDateOccurrences(payload);
  dateOccurrences.forEach(({ date }) => {
    connectionDateCounts[date] = (connectionDateCounts[date] || 0) + 1;
  });

  const nextPageRequestIndex = payload.indexOf('"nextPageRequest"');
  const nextPageContext =
    nextPageRequestIndex >= 0 ? payload.slice(nextPageRequestIndex, nextPageRequestIndex + 2_000) : '';
  const connectionsCount = Number(connectionsCountMatch?.[1]?.replace(/,/g, ''));
  const nextStartIndex = Number(nextPageContext.match(/"startIndex":(\d+)/)?.[1]);
  const connectionRecords = extractConnectionRecords(payload, dateOccurrences);
  const connectionIds = connectionRecords.map((record) => record.id);

  return {
    connectionsCount: Number.isSafeInteger(connectionsCount) ? connectionsCount : undefined,
    connectionDateCounts,
    nextStartIndex: Number.isSafeInteger(nextStartIndex) && nextStartIndex > 0 ? nextStartIndex : undefined,
    ...(connectionIds.length > 0 ? { connectionIds } : {}),
    ...(connectionRecords.length > 0 ? { connectionRecords } : {}),
  };
}
