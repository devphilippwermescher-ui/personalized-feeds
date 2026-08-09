import { describe, expect, it } from 'vitest';
import { parseSearchAppearancesSnapshot } from '../profile-analytics-search-appearances-parser';

describe('Search Appearances analytics parsing', () => {
  const collectedAt = Date.UTC(2026, 7, 6, 19, 43, 31);
  const sourceUrl = 'https://www.linkedin.com/voyager/api/graphql?surfaceType=SEARCH_APPEARANCES';

  it('reads Search appearances instead of the broader All appearances metric', () => {
    const payload = {
      included: [
        {
          entityUrn:
            'urn:li:fsd_edgeInsightsAnalyticsCard:(SEARCH_APPEARANCES,urn:li:profileAppearances:1,ANALYTICS,DETAILS,PROFILE_APPEARANCES_INSIGHTS_CONSOLIDATED_CARD)',
          components: [
            {
              summary: {
                keyMetrics: {
                  items: [
                    {
                      description: { text: 'All appearances' },
                      title: { text: '207' },
                      valuePercentageDescription: 'past 7 days',
                    },
                    {
                      description: { text: 'Search appearances' },
                      title: { text: '3' },
                      valuePercentageDescription: 'past 7 days',
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };

    expect(parseSearchAppearancesSnapshot(payload, collectedAt, sourceUrl)).toEqual({
      totalCount: 3,
      periodLabel: 'Past 7 days',
      updatedAt: collectedAt,
      sourceUrl,
    });
  });

  it('uses the second consolidated-card metric when LinkedIn localizes its labels', () => {
    const payload = {
      included: [
        {
          entityUrn: `urn:li:test:${'PROFILE_APPEARANCES_INSIGHTS_CONSOLIDATED_CARD'}`,
          components: [
            {
              summary: {
                keyMetrics: {
                  items: [
                    { description: { text: 'Усі появи' }, title: { text: '1,207' } },
                    {
                      description: { text: 'Появи в пошуку' },
                      title: { text: '1,234' },
                      valuePercentageDescription: 'останні 7 днів',
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };

    expect(parseSearchAppearancesSnapshot(payload, collectedAt, sourceUrl)?.totalCount).toBe(1_234);
  });

  it('returns null when the response does not contain the analytics metric', () => {
    expect(parseSearchAppearancesSnapshot({ included: [] }, collectedAt, sourceUrl)).toBeNull();
  });
});
