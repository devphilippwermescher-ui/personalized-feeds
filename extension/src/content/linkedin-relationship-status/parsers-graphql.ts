import { asArray, asRecord } from './utils';
import type { RelationshipResolution } from './types';
import { extractStatusFromProfileEntry } from './parsers-structured';

export function parseGraphQLRelationshipStatus(
  payload: unknown
): RelationshipResolution | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const collection = asRecord(data?.identityDashProfilesByMemberIdentity);
  const elements = asArray(collection?.elements);

  for (const element of elements) {
    const result = extractStatusFromProfileEntry(element);
    if (result) {
      return result;
    }
  }

  return null;
}
