import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface FieldOverride {
  collectionGroup?: string;
  fieldPath?: string;
  indexes?: Array<{
    order?: string;
    queryScope?: string;
  }>;
}

describe('sharing Firestore indexes', () => {
  it('keeps the collection-group index available for legacy sharing audits', () => {
    const config = JSON.parse(readFileSync('../firestore.indexes.json', 'utf8')) as {
      fieldOverrides?: FieldOverride[];
    };

    const targetUidOverride = config.fieldOverrides?.find(
      (override) => override.collectionGroup === 'shares' && override.fieldPath === 'targetUid'
    );

    expect(targetUidOverride?.indexes).toContainEqual({
      order: 'ASCENDING',
      queryScope: 'COLLECTION_GROUP',
    });
  });
});
