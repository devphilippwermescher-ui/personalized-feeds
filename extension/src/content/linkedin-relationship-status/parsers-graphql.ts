import { asArray, asRecord, asString } from './utils';
import type { RelationshipResolution } from './types';
import {
  collectEntities,
  enrichFromEntities,
  extractStatusFromProfileEntry,
  resolveStatusFromEntities,
} from './parsers-structured';

export function parseGraphQLRelationshipStatus(
  payload: unknown
): RelationshipResolution | null {
  const root = asRecord(payload);
  const rawData = asRecord(root?.data);
  const data = asRecord(rawData?.data) || rawData;
  const collection = asRecord(data?.identityDashProfilesByMemberIdentity);
  const entities = new Map<string, unknown>();
  collectEntities(payload, entities);

  const directElements = asArray(collection?.elements);
  const referencedElements = asArray(collection?.['*elements'])
    .map((reference) => entities.get(asString(reference) || ''))
    .filter(Boolean);
  const elements = directElements.length > 0 ? directElements : referencedElements;

  for (const element of elements) {
    const result = extractStatusFromProfileEntry(element);
    if (result) {
      return result;
    }
  }

  const baseResult = resolveStatusFromEntities(entities);
  if (baseResult) {
    return enrichFromEntities(baseResult, entities);
  }

  return null;
}
