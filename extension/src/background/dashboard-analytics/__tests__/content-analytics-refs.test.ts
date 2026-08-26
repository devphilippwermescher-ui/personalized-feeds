import { describe, expect, it, vi } from 'vitest';

// Only path composition is under test, so Firestore itself is stubbed with
// segment-joining fakes. No Firebase app is initialised and nothing is fetched.
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
}));
vi.mock('shared/firebase-config', () => ({ getFirebaseDb: () => ({ id: 'test-db' }) }));

import {
  contentAnalyticsDailyDoc,
  contentAnalyticsDoc,
  contentAnalyticsPostDoc,
  contentAnalyticsRangeDoc,
  contentAnalyticsRangesCollection,
  dashboardAnalyticsSyncDoc,
  profileAnalyticsDoc,
} from 'shared/firestore/refs';
import { getContentAnalyticsPostId, getContentAnalyticsRangeId } from 'shared/content-analytics-metrics';

describe('Content Analytics Firestore paths', () => {
  it('scopes every document under the owning user', () => {
    expect(contentAnalyticsDoc('user-1').path).toBe('users/user-1/contentAnalytics/current');
    expect(contentAnalyticsRangesCollection('user-1').path).toBe('users/user-1/contentAnalyticsRanges');
    expect(contentAnalyticsDailyDoc('user-1', '2026-08-22').path).toBe(
      'users/user-1/contentAnalyticsDaily/2026-08-22'
    );
    expect(dashboardAnalyticsSyncDoc('user-1').path).toBe('users/user-1/dashboardAnalyticsSync/current');
  });

  it('keeps the existing Profile Analytics document path unchanged', () => {
    expect(profileAnalyticsDoc('user-1').path).toBe('users/user-1/profileAnalytics/current');
  });

  it('stores a preset range under its range key and a custom range under its window', () => {
    expect(
      contentAnalyticsRangeDoc('user-1', getContentAnalyticsRangeId('30d', '2026-07-24', '2026-08-22')).path
    ).toBe('users/user-1/contentAnalyticsRanges/30d');
    expect(
      contentAnalyticsRangeDoc('user-1', getContentAnalyticsRangeId('custom', '2026-01-01', '2026-01-31')).path
    ).toBe('users/user-1/contentAnalyticsRanges/custom_2026-01-01_2026-01-31');
  });

  it('stores one post per activity id, whichever urn form it arrived as', () => {
    const fromActivity = contentAnalyticsPostDoc(
      'user-1',
      getContentAnalyticsPostId('urn:li:activity:7497022560266780672')
    ).path;
    const fromShare = contentAnalyticsPostDoc(
      'user-1',
      getContentAnalyticsPostId('urn:li:share:7497022560266780672')
    ).path;

    expect(fromActivity).toBe('users/user-1/contentAnalyticsPosts/7497022560266780672');
    expect(fromShare).toBe(fromActivity);
  });
});
