import { describe, expect, it } from 'vitest';
import type { ContentAnalyticsRangeSnapshot, DashboardAnalyticsSyncManifest } from 'shared/types';
import {
  buildContentMetricCards,
  formatContentMetricValue,
  formatEngagementRate,
  getContentAnalyticsNotice,
  hasPublishedContentAnalyticsData,
  selectContentRangeSnapshot,
  shouldShowContentAnalyticsConnectionPrompt,
} from '../content-view-model';

function range(overrides: Partial<ContentAnalyticsRangeSnapshot> = {}): ContentAnalyticsRangeSnapshot {
  return {
    id: '30d',
    rangeKey: '30d',
    startDate: '2026-07-24',
    endDate: '2026-08-22',
    timezone: 'UTC',
    metrics: { posts: 17, impressions: 1800, engagementRate: 0.6, reactions: 22, comments: 4, reposts: 0 },
    coverage: {},
    syncRunId: 'run-1',
    capturedAt: 1,
    publishedAt: 1,
    sourceUrl: 'https://www.linkedin.com/flagship-web/analytics/creator/content/',
    ...overrides,
  };
}

describe('metric formatting', () => {
  it('renders the engagement rate with one decimal', () => {
    expect(formatEngagementRate(0.64)).toBe('0.6%');
    expect(formatEngagementRate(2)).toBe('2.0%');
  });

  it('renders a dash instead of a fake zero percent when the rate is undefined', () => {
    expect(formatEngagementRate(null)).toBe('—');
    expect(formatEngagementRate(undefined)).toBe('—');
  });

  it('abbreviates large counts the way the design does', () => {
    expect(formatContentMetricValue('impressions', 1800)).toBe('1,800');
    expect(formatContentMetricValue('impressions', 18_000)).toBe('18.0K');
    expect(formatContentMetricValue('posts', 17)).toBe('17');
  });
});

describe('buildContentMetricCards', () => {
  it('builds all six cards in the designed order', () => {
    expect(buildContentMetricCards(range()).map((card) => card.key)).toEqual([
      'posts',
      'impressions',
      'engagementRate',
      'reactions',
      'comments',
      'reposts',
    ]);
  });

  it('shows real values including a genuine zero', () => {
    const cards = buildContentMetricCards(range());

    expect(cards[0].value).toBe('17');
    expect(cards[2].value).toBe('0.6%');
    expect(cards[5].value).toBe('0');
    expect(cards[5].available).toBe(true);
  });

  it('renders a dash for a metric LinkedIn did not report', () => {
    const cards = buildContentMetricCards(range({ metrics: { posts: 17 }, coverage: { reactions: 'unavailable' } }));

    expect(cards.find((card) => card.key === 'reactions')).toMatchObject({ value: '—', available: false });
  });

  it('renders dashes when no range has been collected yet', () => {
    expect(buildContentMetricCards(undefined).every((card) => card.value === '—')).toBe(true);
  });

  it('keeps a known-but-undefined engagement rate as a dash', () => {
    const cards = buildContentMetricCards(range({ metrics: { impressions: 0, engagementRate: null } }));

    expect(cards.find((card) => card.key === 'engagementRate')?.value).toBe('—');
  });
});

describe('hasPublishedContentAnalyticsData', () => {
  it('does not mistake a failed-run shell snapshot for collected metrics', () => {
    expect(
      hasPublishedContentAnalyticsData(
        {
          defaultRangeKey: '30d',
          syncRunId: 'failed-run',
          capturedAt: 1,
          publishedAt: 1,
          updatedAt: 1,
        },
        []
      )
    ).toBe(false);
  });

  it('recognises an embedded or separately stored range as collected data', () => {
    const collectedRange = range();
    expect(
      hasPublishedContentAnalyticsData(
        {
          defaultRangeKey: '30d',
          range: collectedRange,
          syncRunId: 'run-1',
          capturedAt: 1,
          publishedAt: 1,
          updatedAt: 1,
        },
        []
      )
    ).toBe(true);
    expect(hasPublishedContentAnalyticsData(null, [collectedRange])).toBe(true);
  });
});

describe('selectContentRangeSnapshot', () => {
  const ranges = [
    range(),
    range({ id: '90d', rangeKey: '90d', startDate: '2026-05-25' }),
    range({ id: '6m', rangeKey: '6m', startDate: '2026-02-21' }),
  ];
  const customRange = { start: new Date(2026, 7, 1), end: new Date(2026, 7, 10) };

  it('uses the widest successfully collected snapshot for Total', () => {
    expect(selectContentRangeSnapshot(ranges, 'total', customRange)?.id).toBe('6m');
  });

  it('includes the embedded current snapshot when resolving Total', () => {
    const oneYear = range({ id: '1y', rangeKey: '1y', startDate: '2025-08-23' });

    expect(selectContentRangeSnapshot(ranges, 'total', customRange, oneYear)?.id).toBe('1y');
  });

  it('picks the snapshot for the selected preset', () => {
    expect(selectContentRangeSnapshot(ranges, '90d', customRange)?.id).toBe('90d');
  });

  it('prefers an exactly collected custom window', () => {
    const exact = range({ id: 'custom_2026-08-01_2026-08-10', rangeKey: 'custom' });

    expect(selectContentRangeSnapshot([...ranges, exact], 'custom', customRange)?.id).toBe(
      'custom_2026-08-01_2026-08-10'
    );
  });

  it('falls back to the narrowest collected range that contains the custom window', () => {
    expect(selectContentRangeSnapshot(ranges, 'custom', customRange)?.id).toBe('30d');
  });

  it('returns nothing when no collected range covers the request', () => {
    const customRangeOutside = { start: new Date(2020, 0, 1), end: new Date(2020, 0, 10) };

    expect(selectContentRangeSnapshot(ranges, 'custom', customRangeOutside)).toBeUndefined();
  });
});

describe('getContentAnalyticsNotice', () => {
  function manifest(patch: Partial<DashboardAnalyticsSyncManifest>): DashboardAnalyticsSyncManifest {
    return {
      syncRunId: 'run-1',
      status: 'success',
      trigger: 'alarm',
      startedAt: 1,
      profile: { status: 'success' },
      content: { status: 'success' },
      ...patch,
    };
  }

  it('is silent on a healthy run', () => {
    expect(getContentAnalyticsNotice({ manifest: manifest({}), extensionError: null, hasCachedData: true })).toBeNull();
  });

  it('reports a LinkedIn restriction while cached values stay visible', () => {
    const notice = getContentAnalyticsNotice({
      manifest: manifest({ status: 'partial', content: { status: 'blocked' } }),
      extensionError: null,
      hasCachedData: true,
    });

    expect(notice).toMatchObject({ tone: 'blocked' });
    expect(notice?.message).toMatch(/last saved data/i);
  });

  it('reports a partial content run as a warning', () => {
    expect(
      getContentAnalyticsNotice({
        manifest: manifest({ status: 'partial', content: { status: 'partial' } }),
        extensionError: null,
        hasCachedData: true,
      })
    ).toMatchObject({ tone: 'warning' });
  });

  it('reports a local Content failure before a Firestore manifest exists', () => {
    expect(
      getContentAnalyticsNotice({
        manifest: null,
        localContentStatus: {
          status: 'failed',
          errorCode: 'linkedin_auth_required',
          message: 'The LinkedIn session could not be verified.',
        },
        extensionError: null,
        hasCachedData: false,
      })
    ).toMatchObject({
      tone: 'warning',
      message: 'The LinkedIn session could not be verified.',
    });
  });

  it('shows first-sync progress instead of a silent empty page', () => {
    expect(
      getContentAnalyticsNotice({
        manifest: null,
        localContentStatus: { status: 'syncing' },
        extensionError: null,
        hasCachedData: false,
      })?.message
    ).toMatch(/collecting/i);

    expect(
      getContentAnalyticsNotice({
        manifest: null,
        localContentStatus: { status: 'idle' },
        extensionError: null,
        hasCachedData: false,
      })?.message
    ).toMatch(/has not been collected/i);
  });

  it('mentions background post enrichment without alarming the reader', () => {
    expect(
      getContentAnalyticsNotice({
        manifest: manifest({ postEnrichment: { status: 'partial' } }),
        extensionError: null,
        hasCachedData: true,
      })?.message
    ).toMatch(/still being collected/i);
  });

  it('prompts for the extension only when there is nothing cached to show', () => {
    expect(
      getContentAnalyticsNotice({ manifest: null, extensionError: 'unavailable', hasCachedData: false })
    ).toMatchObject({ tone: 'info' });
    expect(
      getContentAnalyticsNotice({ manifest: null, extensionError: 'unavailable', hasCachedData: true })
    ).toBeNull();
  });
});

describe('shouldShowContentAnalyticsConnectionPrompt', () => {
  it('does not treat a valid first run with no collected data as a disconnected extension', () => {
    expect(
      shouldShowContentAnalyticsConnectionPrompt({
        loading: false,
        hasPublishedData: false,
        syncStatusLoaded: true,
        extensionError: null,
      })
    ).toBe(false);
  });

  it('shows the prompt only after the extension bridge actually fails', () => {
    expect(
      shouldShowContentAnalyticsConnectionPrompt({
        loading: false,
        hasPublishedData: false,
        syncStatusLoaded: true,
        extensionError: 'Extension bridge unavailable',
      })
    ).toBe(true);
  });

  it('keeps cached analytics visible when the extension becomes unavailable', () => {
    expect(
      shouldShowContentAnalyticsConnectionPrompt({
        loading: false,
        hasPublishedData: true,
        syncStatusLoaded: true,
        extensionError: 'Extension bridge unavailable',
      })
    ).toBe(false);
  });
});
