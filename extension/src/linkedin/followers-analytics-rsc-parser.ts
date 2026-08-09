function parseCount(value: string): number | undefined {
  const normalized = value.replace(/[^\d.-]/g, '');
  if (!normalized) return undefined;

  const count = Number(normalized);
  return Number.isFinite(count) && count >= 0 ? Math.round(count) : undefined;
}

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.values(value as Record<string, unknown>).forEach((item) => collectStrings(item, output));
}

function findReferenceBefore(value: unknown, targetReference: string): string | undefined {
  if (Array.isArray(value)) {
    for (let index = 1; index < value.length; index += 1) {
      if (value[index] === targetReference && typeof value[index - 1] === 'string') {
        const candidate = value[index - 1] as string;
        if (/^\$L[\da-f]+$/i.test(candidate)) return candidate;
      }
    }
    for (const item of value) {
      const match = findReferenceBefore(item, targetReference);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  for (const item of Object.values(value as Record<string, unknown>)) {
    const match = findReferenceBefore(item, targetReference);
    if (match) return match;
  }
  return undefined;
}

function parseRscRecords(payload: string): Map<string, unknown> {
  const records = new Map<string, unknown>();
  for (const line of payload.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;

    const id = line.slice(0, separatorIndex);
    if (!/^[\da-f]+$/i.test(id)) continue;

    try {
      records.set(id.toLowerCase(), JSON.parse(line.slice(separatorIndex + 1)) as unknown);
    } catch {
      // RSC may contain non-JSON control chunks. Only component records are needed.
    }
  }
  return records;
}

function findNumericText(value: unknown): number | undefined {
  const strings: string[] = [];
  collectStrings(value, strings);
  for (const text of strings) {
    if (!/^\s*\d[\d,.\s]*\s*$/.test(text)) continue;
    const count = parseCount(text);
    if (typeof count === 'number') return count;
  }
  return undefined;
}

export function extractFollowersTotalFromAnalyticsRsc(payload: string): number | undefined {
  const records = parseRscRecords(payload);
  let totalLabelId: string | undefined;

  for (const [id, record] of records) {
    const strings: string[] = [];
    collectStrings(record, strings);
    if (strings.some((text) => text.trim().toLowerCase() === 'total followers')) {
      totalLabelId = id;
      break;
    }
  }

  if (totalLabelId) {
    const targetReference = `$L${totalLabelId}`;
    for (const record of records.values()) {
      const valueReference = findReferenceBefore(record, targetReference);
      if (!valueReference) continue;

      const valueRecord = records.get(valueReference.slice(2).toLowerCase());
      const count = findNumericText(valueRecord);
      if (typeof count === 'number') return count;
    }
  }

  // Localized responses may not contain the English label. The total is the
  // only 2xlarge numeric text in the follower-growth component.
  for (const record of records.values()) {
    const serialized = JSON.stringify(record);
    if (!serialized.includes('"fontSize":"2xlarge"')) continue;
    const count = findNumericText(record);
    if (typeof count === 'number') return count;
  }

  return undefined;
}

export interface LinkedInFollowerHistoryPoint {
  date: string;
  count: number;
}

export function extractFollowersHistoryFromAnalyticsRsc(payload: string): LinkedInFollowerHistoryPoint[] {
  const seriesStart = payload.indexOf('"name":"New followers","data":[');
  if (seriesStart < 0) return [];
  const seriesEnd = payload.indexOf('],"dashStyle"', seriesStart);
  const seriesPayload = payload.slice(seriesStart, seriesEnd > seriesStart ? seriesEnd : undefined);
  const points: LinkedInFollowerHistoryPoint[] = [];
  const pointPattern = /\{"y":(\d+),[\s\S]*?"x":(\d+)\}/g;
  for (const match of seriesPayload.matchAll(pointPattern)) {
    const count = Number(match[1]);
    const timestamp = Number(match[2]);
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isFinite(timestamp)) continue;
    points.push({ date: new Date(timestamp).toISOString().slice(0, 10), count });
  }
  return points;
}
