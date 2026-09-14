export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function compactJoin(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim() || '')
    .filter(Boolean)
    .join(', ');
}

export function getNestedRecord(root: UnknownRecord, keys: string[]): UnknownRecord | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return isRecord(current) ? current : null;
}

export function findFirstRecord(value: unknown, predicate: (record: UnknownRecord) => boolean): UnknownRecord | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstRecord(item, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (predicate(value)) return value;

  for (const nested of Object.values(value)) {
    const match = findFirstRecord(nested, predicate);
    if (match) return match;
  }
  return null;
}

export function findFirstNumberByKey(value: unknown, keyPattern: RegExp): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstNumberByKey(item, keyPattern);
      if (typeof match === 'number') return match;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  for (const [key, nested] of Object.entries(value)) {
    if (keyPattern.test(key) && typeof nested === 'number' && Number.isFinite(nested)) {
      return Math.round(nested);
    }
  }
  for (const nested of Object.values(value)) {
    const match = findFirstNumberByKey(nested, keyPattern);
    if (typeof match === 'number') return match;
  }
  return undefined;
}

export function findFirstNumberByKeyPriority(value: unknown, keyPatterns: RegExp[]): number | undefined {
  for (const keyPattern of keyPatterns) {
    const match = findFirstNumberByKey(value, keyPattern);
    if (typeof match === 'number') return match;
  }
  return undefined;
}

export function findFirstStringByKey(value: unknown, keyPattern: RegExp): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstStringByKey(item, keyPattern);
      if (match) return match;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  for (const [key, nested] of Object.entries(value)) {
    if (keyPattern.test(key)) {
      const text = getString(nested);
      if (text) return text;
    }
  }
  for (const nested of Object.values(value)) {
    const match = findFirstStringByKey(nested, keyPattern);
    if (match) return match;
  }
  return undefined;
}

export function findIncludedEntity(payload: unknown, entityUrn: string): UnknownRecord | null {
  if (!isRecord(payload) || !Array.isArray(payload.included) || !entityUrn) return null;
  return payload.included.filter(isRecord).find((record) => getString(record.entityUrn) === entityUrn) || null;
}

export function chooseVectorImageUrl(value: unknown): string {
  if (!isRecord(value)) return '';
  const rootUrl = getString(value.rootUrl);
  const candidates = (Array.isArray(value.artifacts) ? value.artifacts : [])
    .filter(isRecord)
    .map((artifact) => ({
      width: typeof artifact.width === 'number' ? artifact.width : 0,
      segment: getString(artifact.fileIdentifyingUrlPathSegment),
    }))
    .filter((artifact) => artifact.segment)
    .sort((left, right) => right.width - left.width);
  if (!rootUrl || !candidates[0]) return '';
  return rootUrl.includes('*') ? rootUrl.replace('*', candidates[0].segment) : `${rootUrl}${candidates[0].segment}`;
}
