/**
 * Minimal anonymised `voyagerPremiumDashLibraView` / `CREATOR_TOP_POSTS`
 * payloads. Recipe hashes and tracking ids from the real capture are dropped;
 * the parser must not depend on them.
 */
export interface TopPostsFixtureOptions {
  activityId?: string;
  metricTitle?: string;
  metricText?: string;
  numShares?: number | null;
  includeSocialCounts?: boolean;
}

export function buildTopPostsImpressionsFixture(options: TopPostsFixtureOptions = {}): unknown {
  const activityId = options.activityId ?? '7497022560266780672';
  const activityUrn = `urn:li:activity:${activityId}`;
  return {
    data: {
      data: {
        premiumDashLibraViewByTargetEntity: {
          elements: [
            {
              '*card': [`urn:li:fsd_libraCard:(urn:li:fsd_profile:ANON,CREATOR_ANALYTICS-CREATOR_TOP_POSTS-TOP_POSTS)`],
              $type: 'com.linkedin.voyager.dash.libra.LibraView',
            },
          ],
        },
      },
    },
    included: [
      {
        $type: 'com.linkedin.voyager.dash.libra.card.LibraCard',
        entityUrn: `urn:li:fsd_libraCard:(urn:li:fsd_profile:ANON,CREATOR_ANALYTICS-CREATOR_TOP_POSTS-TOP_POSTS)`,
        components: [
          {
            $type: 'com.linkedin.voyager.dash.libra.LibraComponent',
            leiaComponent: {
              emptyState: null,
              analyticsObjectList: {
                numOfInitialItemsToShow: 50,
                items: [
                  {
                    $type: 'com.linkedin.voyager.dash.edgeinsightsanalytics.AnalyticsObject',
                    content: {
                      analyticsMiniUpdateItem: {
                        $type: 'com.linkedin.voyager.dash.edgeinsightsanalytics.AnalyticsMiniUpdateItem',
                        '*miniUpdate': `urn:li:fsd_miniUpdate:(${activityUrn},CREATOR_POST_PERFORMANCE)`,
                        ctaItem: {
                          $type: 'com.linkedin.voyager.dash.edgeinsightsanalytics.CtaItem',
                          title: options.metricTitle ?? '1 245',
                          text: options.metricText ?? 'Impressions',
                          actionData: {
                            navigationUrl: `https://www.linkedin.com/analytics/post-summary/${activityUrn}`,
                          },
                        },
                      },
                    },
                  },
                ],
                $type: 'com.linkedin.voyager.dash.edgeinsightsanalytics.AnalyticsObjectList',
              },
            },
          },
        ],
      },
      {
        $type: 'com.linkedin.voyager.dash.feed.miniupdate.MiniUpdate',
        entityUrn: `urn:li:fsd_miniUpdate:(${activityUrn},CREATOR_POST_PERFORMANCE)`,
        metadata: { backendUrn: activityUrn, $type: 'com.linkedin.voyager.dash.feed.miniupdate.MiniUpdateMetadata' },
        commentary: {
          $type: 'com.linkedin.voyager.dash.feed.miniupdate.MiniUpdateCommentaryComponent',
          commentaryText: { text: 'Sample post body for parser tests.' },
          navigationContext: { target: `https://www.linkedin.com/feed/update/${activityUrn}` },
        },
      },
      ...(options.includeSocialCounts === false
        ? []
        : [
            {
              $type: 'com.linkedin.voyager.dash.feed.SocialActivityCounts',
              urn: activityUrn,
              entityUrn: `urn:li:fsd_socialActivityCounts:urn:li:share:${activityId}`,
              numLikes: 8,
              numComments: 3,
              numShares: options.numShares === undefined ? null : options.numShares,
              numImpressions: null,
            },
          ]),
    ],
  };
}

export function buildTopPostsEmptyEngagementsFixture(): unknown {
  return {
    data: {
      data: {
        premiumDashLibraViewByTargetEntity: {
          elements: [
            {
              '*card': ['urn:li:fsd_libraCard:(urn:li:fsd_profile:ANON,CREATOR_ANALYTICS-CREATOR_TOP_POSTS-TOP_POSTS)'],
              $type: 'com.linkedin.voyager.dash.libra.LibraView',
            },
          ],
        },
      },
    },
    included: [
      {
        $type: 'com.linkedin.voyager.dash.libra.card.LibraCard',
        components: [
          {
            $type: 'com.linkedin.voyager.dash.libra.LibraComponent',
            leiaComponent: {
              analyticsObjectList: null,
              emptyState: {
                $type: 'com.linkedin.voyager.dash.edgeinsightsanalytics.EmptyState',
                title: "We don't have enough information yet",
                subtitle: 'Try posting more to boost engagements.',
              },
            },
          },
        ],
      },
    ],
  };
}
