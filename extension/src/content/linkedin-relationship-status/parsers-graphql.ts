import { asArray, asRecord, asString } from './utils';
import type { RelationshipResolution } from './types';
import {
  collectEntities,
  enrichFromEntities,
  extractStatusFromProfileEntry,
  resolveStatusFromEntities,
} from './parsers-structured';

function getGraphQLErrorStatus(error: unknown): number | null {
  const extensions = asRecord(asRecord(error)?.extensions);
  const status = extensions?.status;
  return typeof status === 'number' ? status : null;
}

function isProfileAccessDeniedError(error: unknown): boolean {
  const record = asRecord(error);
  const message = asString(record?.message) || '';
  const extensions = asRecord(record?.extensions);
  const exceptionClass = asString(extensions?.exceptionClass) || '';
  const classification = asString(extensions?.classification) || '';
  const status = getGraphQLErrorStatus(error);

  return (
    status === 403 &&
    /DataFetchingException/i.test(classification) &&
    /VoyagerUserVisibleException/i.test(exceptionClass) &&
    /profile can.?t be accessed/i.test(message)
  );
}

function parseUnavailableGraphQLError(payload: unknown): RelationshipResolution | null {
  const errors = asArray(asRecord(payload)?.errors);
  if (!errors.some(isProfileAccessDeniedError)) {
    return null;
  }

  return {
    status: 'unavailable',
    canMessage: false,
    canFollow: false,
    canConnect: false,
    isFollowing: false,
  };
}

export function parseGraphQLRelationshipStatus(
  payload: unknown
): RelationshipResolution | null {
  const unavailableErrorResult = parseUnavailableGraphQLError(payload);
  if (unavailableErrorResult) {
    return unavailableErrorResult;
  }

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
