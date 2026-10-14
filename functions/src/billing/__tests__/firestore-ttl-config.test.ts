import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface FieldOverride {
  collectionGroup?: string;
  fieldPath?: string;
  ttl?: boolean;
}

describe('billing Firestore TTL configuration', () => {
  it('automatically removes every short-lived billing document', () => {
    const config = JSON.parse(readFileSync('../firestore.indexes.json', 'utf8')) as {
      fieldOverrides?: FieldOverride[];
    };
    const ttlCollections = new Set(
      config.fieldOverrides
        ?.filter((override) => override.fieldPath === 'deleteAt' && override.ttl === true)
        .map((override) => override.collectionGroup)
    );

    expect([...ttlCollections]).toEqual(
      expect.arrayContaining([
        'billingCheckoutSessions',
        'billingHandoffs',
        'billingCheckoutRateLimits',
        'billingUserCheckoutLocks',
      ])
    );
  });
});
