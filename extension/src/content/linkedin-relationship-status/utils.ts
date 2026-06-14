import type { RelationshipResolution } from './types';

export function normalizeRelationshipResolution(
  resolution: RelationshipResolution
): RelationshipResolution {
  if (resolution.status !== 'connected' || resolution.canMessage === true) {
    return resolution;
  }

  return {
    ...resolution,
    canMessage: true,
  };
}

export function getCsrfToken(): string {
  const match = document.cookie.match(/JSESSIONID="([^"]+)"/);
  return match ? match[1] : '';
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function pickProfileUrn(...values: unknown[]): string | undefined {
  for (const value of values) {
    const urn = asString(value);
    if (urn?.startsWith('urn:li:fsd_profile:')) {
      return urn;
    }
  }
  return undefined;
}

export function isFollowingStateActive(value: unknown): boolean {
  return asRecord(value)?.following === true;
}

export function getComposeOptionType(action: unknown): string | undefined {
  return asString(asRecord(asRecord(action)?.composeOption)?.composeOptionType);
}

export function trimLinkedInValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => trimLinkedInValue(item));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      result[key.trim()] = trimLinkedInValue(nestedValue);
    }
    return result;
  }

  return value;
}
