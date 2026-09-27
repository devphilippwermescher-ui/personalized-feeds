import { describe, expect, it } from 'vitest';
import { extractActivityId, getActivityPublishedAt, resolveActivityIdentity } from '../linkedin-activity-urn';

describe('LinkedIn activity identity', () => {
  it('extracts the numeric id from every urn form LinkedIn uses', () => {
    expect(extractActivityId('urn:li:activity:7497022560266780672')).toBe('7497022560266780672');
    expect(extractActivityId('urn:li:share:7497022560266780672')).toBe('7497022560266780672');
    expect(extractActivityId('urn:li:fsd_miniUpdate:(urn:li:activity:7497022560266780672,X)')).toBe(
      '7497022560266780672'
    );
    expect(extractActivityId('https://www.linkedin.com/feed/update/urn:li:activity:7497022560266780672')).toBe(
      '7497022560266780672'
    );
  });

  it('keeps both urns while canonicalising on the activity urn', () => {
    const identity = resolveActivityIdentity([
      'urn:li:share:7497022560266780672',
      'urn:li:activity:7497022560266780672',
    ]);

    expect(identity.activityUrn).toBe('urn:li:activity:7497022560266780672');
    expect(identity.shareUrn).toBe('urn:li:share:7497022560266780672');
    expect(identity.activityId).toBe('7497022560266780672');
  });

  it('derives an activity urn when only a share urn is present', () => {
    const identity = resolveActivityIdentity(['urn:li:share:7497022560266780672']);

    expect(identity.activityUrn).toBe('urn:li:activity:7497022560266780672');
  });

  it('decodes the snowflake publish timestamp without losing precision', () => {
    expect(getActivityPublishedAt('7497022560266780672')).toBe(1787429466311);
    expect(new Date(getActivityPublishedAt('7497022560266780672') as number).toISOString()).toBe(
      '2026-08-22T20:11:06.311Z'
    );
  });

  it('rejects ids that decode outside a plausible publishing window', () => {
    expect(getActivityPublishedAt('123456')).toBeUndefined();
    expect(getActivityPublishedAt('not-a-number')).toBeUndefined();
  });
});
