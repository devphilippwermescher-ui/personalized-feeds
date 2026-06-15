import { decodeHtmlEntities, trimLinkedInValue } from './utils';
import type { RelationshipResolution } from './types';

import { collectEntities, enrichFromEntities, resolveStatusFromEntities } from './parsers-structured';

export function parseStatusFromCodeBlocks(html: string): RelationshipResolution | null {
  const allEntities = new Map<string, unknown>();
  const parsedHtml = new DOMParser().parseFromString(html, 'text/html');
  const codeBlocks = Array.from(parsedHtml.querySelectorAll('code'));

  for (const block of codeBlocks) {
    const raw = block.textContent || '';
    if (!raw.includes('fsd_memberRelationship') && !raw.includes('invitationState') && !raw.includes('*memberRelationship')) {
      continue;
    }

    try {
      const decoded = decodeHtmlEntities(raw);
      const parsed = JSON.parse(decoded);
      const normalized = trimLinkedInValue(parsed);
      collectEntities(normalized, allEntities);
    } catch {
      // skip non-JSON code block
    }
  }

  if (allEntities.size === 0) return null;
  const base = resolveStatusFromEntities(allEntities);
  if (!base) return null;
  return enrichFromEntities(base, allEntities);
}
