import type { LinkedInConnectionRecord, LinkedInConnectionsRscPage } from './linkedin-connections-types';

function toDateKey(value: string): string | undefined {
  const timestamp = Date.parse(`${value} UTC`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : undefined;
}

export function parseLinkedInConnectionsRscPage(payload: string): LinkedInConnectionsRscPage {
  const connectionsCountMatch =
    payload.match(
      /"id"\s*:\s*"totalConnectionsCount"[\s\S]{0,500}?"(?:intValue|longValue|stringValue)"\s*:\s*"?([\d,]+)"?/
    ) || payload.match(/\b([\d,]+)\s+connections\b/i);
  const connectionDateCounts: Record<string, number> = {};
  const connectedOnPattern = /Connected on ([A-Z][a-z]+ \d{1,2}, \d{4})/g;

  for (const match of payload.matchAll(connectedOnPattern)) {
    const dateKey = toDateKey(match[1]);
    if (dateKey) connectionDateCounts[dateKey] = (connectionDateCounts[dateKey] || 0) + 1;
  }

  const nextPageRequestIndex = payload.indexOf('"nextPageRequest"');
  const nextPageContext =
    nextPageRequestIndex >= 0 ? payload.slice(nextPageRequestIndex, nextPageRequestIndex + 2_000) : '';
  const connectionsCount = Number(connectionsCountMatch?.[1]?.replace(/,/g, ''));
  const nextStartIndex = Number(nextPageContext.match(/"startIndex":(\d+)/)?.[1]);
  const recordsById = new Map<string, LinkedInConnectionRecord>();
  for (const dateMatch of payload.matchAll(connectedOnPattern)) {
    const dateIndex = dateMatch.index || 0;
    const context = payload.slice(Math.max(0, dateIndex - 2_000), dateIndex + dateMatch[0].length + 200);
    const matches = Array.from(
      context.matchAll(/(?:https?:\\?\/\\?\/www\.linkedin\.com)?\\?\/in\\?\/([A-Za-z0-9_%.-]+)/g)
    );
    const rawId = matches[matches.length - 1]?.[1];
    const connectedDate = toDateKey(dateMatch[1]);
    if (!rawId || !connectedDate) continue;
    let id: string;
    try {
      id = decodeURIComponent(rawId).toLowerCase();
    } catch {
      id = rawId.toLowerCase();
    }
    if (!recordsById.has(id)) recordsById.set(id, { id, connectedDate });
  }
  const connectionRecords = Array.from(recordsById.values());
  const connectionIds = connectionRecords.map((record) => record.id);

  return {
    connectionsCount: Number.isSafeInteger(connectionsCount) ? connectionsCount : undefined,
    connectionDateCounts,
    nextStartIndex: Number.isSafeInteger(nextStartIndex) && nextStartIndex > 0 ? nextStartIndex : undefined,
    ...(connectionIds.length > 0 ? { connectionIds } : {}),
    ...(connectionRecords.length > 0 ? { connectionRecords } : {}),
  };
}
