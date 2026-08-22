/**
 * Minimal reader for LinkedIn's React Flight (RSC) text streams.
 *
 * The payload arrives as `application/octet-stream` but is a newline-delimited
 * `<hex-id>:<json>` stream. Nothing here depends on minified component ids or
 * `$recipeTypes`; callers match on semantic props such as label text and
 * `fontSize` instead.
 */
export interface RscFlightRecord {
  id: string;
  value: unknown;
}

export function parseRscFlightRecords(payload: string): Map<string, unknown> {
  const records = new Map<string, unknown>();
  for (const line of payload.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;

    const id = line.slice(0, separatorIndex);
    if (!/^[\da-f]+$/i.test(id)) continue;

    try {
      records.set(id.toLowerCase(), JSON.parse(line.slice(separatorIndex + 1)) as unknown);
    } catch {
      // Control chunks (`I[...]`, `$S...`) are not JSON records. Skip them.
    }
  }
  return records;
}

/** Ordered records, preserving the stream order the labels were emitted in. */
export function parseOrderedRscFlightRecords(payload: string): RscFlightRecord[] {
  const records: RscFlightRecord[] = [];
  for (const line of payload.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;

    const id = line.slice(0, separatorIndex);
    if (!/^[\da-f]+$/i.test(id)) continue;

    try {
      records.push({ id: id.toLowerCase(), value: JSON.parse(line.slice(separatorIndex + 1)) as unknown });
    } catch {
      // Same as above: only JSON component records are useful.
    }
  }
  return records;
}

export function collectRscStrings(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectRscStrings(item, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.values(value as Record<string, unknown>).forEach((item) => collectRscStrings(item, output));
}

/**
 * Locale-tolerant count parser. LinkedIn renders thousands with a comma, a
 * period, a plain space, or a narrow no-break space depending on locale.
 */
export function parseRscCount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d[\d.,  \s]*$/.test(trimmed)) return undefined;

  const digitsOnly = trimmed.replace(/[.,  \s]/g, '');
  if (!/^\d+$/.test(digitsOnly)) return undefined;

  // A single separator followed by 1-2 digits is a decimal, not a group.
  const decimalMatch = trimmed.match(/^(\d+)[.,](\d{1,2})$/);
  if (decimalMatch) return Math.round(Number(`${decimalMatch[1]}.${decimalMatch[2]}`));

  const count = Number(digitsOnly);
  return Number.isFinite(count) ? count : undefined;
}

/**
 * The rendered text of a leaf record.
 *
 * RSC nodes carry style props as plain strings, so only a `children` value
 * that is a lone string counts as visible text. This keeps label matching
 * independent of minified component ids and class names.
 */
export function getRscRecordText(record: unknown): string | undefined {
  if (typeof record === 'string') return record.startsWith('$') ? undefined : record;
  if (Array.isArray(record)) {
    // An RSC element is `["$", type, key, props]`. Its type and key are style
    // metadata, so only the props object can hold rendered text.
    const items = record[0] === '$' ? record.slice(3) : record;
    for (const item of items) {
      const text = getRscRecordText(item);
      if (text !== undefined) return text;
    }
    return undefined;
  }
  if (!record || typeof record !== 'object') return undefined;

  const entries = Object.entries(record as Record<string, unknown>);
  const children = entries.find(([key]) => key === 'children')?.[1];
  if (typeof children === 'string' && !children.startsWith('$')) return children;
  if (Array.isArray(children) && children.length === 1 && typeof children[0] === 'string') {
    return children[0].startsWith('$') ? undefined : children[0];
  }

  for (const [, value] of entries) {
    if (!value || typeof value !== 'object') continue;
    const text = getRscRecordText(value);
    if (text !== undefined) return text;
  }
  return undefined;
}

export function isRscHighlightValueRecord(record: unknown): boolean {
  const serialized = JSON.stringify(record) || '';
  return serialized.includes('"fontSize":"2xlarge"') || serialized.includes('"fontWeight":"bold"');
}

export function isRscParagraphRecord(record: unknown): boolean {
  return Array.isArray(record) && record[0] === '$' && record[1] === 'p';
}

/** UTC `YYYY-MM-DD` for a LinkedIn chart x value or any epoch millisecond. */
export function toUtcDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
