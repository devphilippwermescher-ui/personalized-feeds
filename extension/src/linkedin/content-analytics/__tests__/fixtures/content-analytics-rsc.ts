/**
 * Minimal anonymised Content Analytics RSC stream.
 *
 * Only the semantic fragments the parser relies on are reproduced: the range
 * state, the export-modal window, the two metric cards with their series, and
 * the social-engagement breakdown rows. No profile data, media URLs, cookies
 * or tracking ids from a real capture are included.
 */
function textChunk(id: string, text: string, fontSize: 'small' | '2xlarge'): string {
  return `${id}:["$","$Lxx",null,{"maxLineCountExpression":0,"textProps":{"fontFamily":"sans","fontSize":"${fontSize}","fontWeight":"${
    fontSize === '2xlarge' ? 'bold' : 'normal'
  }","children":["${text}"],"linkHoverDecoration":"underline"}}]`;
}

function paragraphChunk(id: string, text: string): string {
  return `${id}:["$","p",null,{"className":"anon","children":["${text}"]}]`;
}

function seriesChunk(id: string, name: string, points: Array<[number, number]>): string {
  const data = points
    .map(([x, y]) => `{"y":${y},"tooltipPercentageText":null,"x":${x}}`)
    .join(',');
  return `${id}:["$","$Lyy",null,{"chart":{"type":"line"},"series":[{"name":"${name}","data":[${data}],"dashStyle":"Solid"}],"xAxis":{"type":"datetime"},"yAxis":[{"type":"linear"}]}]`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const START_MS = Date.UTC(2026, 7, 16);

export interface ContentAnalyticsRscFixtureOptions {
  impressions?: number;
  engagements?: number;
  impressionsSeries?: number[];
  cumulativeImpressionsSeries?: number[];
  socialRows?: boolean;
  reactions?: number;
  omitImpressionsCard?: boolean;
}

export function buildContentAnalyticsRscFixture(options: ContentAnalyticsRscFixtureOptions = {}): string {
  const impressions = options.impressions ?? 17;
  const engagements = options.engagements ?? 4;
  const dailyValues = options.impressionsSeries ?? [0, 0, 0, 0, 0, 0, impressions];
  const points = dailyValues.map((value, index): [number, number] => [START_MS + index * DAY_MS, value]);

  const lines = [
    '1:"$Sreact.fragment"',
    '3:I["anonymised-component-id",[],"Screen"]',
    '0:{"modelStates":[{"key":{"key":{"value":{"$case":"id","id":"content_analytics_state_date_range_binding"}}},"value":{"$case":"stringValue","stringValue":"Past7Days"}},{"key":{"key":{"value":{"$case":"id","id":"topPostLeafPageUrl"}}},"value":{"$case":"stringValue","stringValue":"https://www.linkedin.com/analytics/creator/top-posts/?endDate=2026-08-22&startDate=2026-08-16&metricType=IMPRESSIONS&timeRange=past_7_days"}}]}',
    '10:["$","div",null,{"screenId":"com.linkedin.sdui.flagshipnav.creatoranalytics.AggregateAnalyticsExportModal","requestedArguments":{"payload":{"startDate":"2026-08-16","endDate":"2026-08-22"}}}]',
  ];

  if (!options.omitImpressionsCard) {
    lines.push(textChunk('51', String(impressions), '2xlarge'));
    lines.push(textChunk('52', 'Impressions', 'small'));
  }
  lines.push(seriesChunk('53', 'Impressions', points));

  if (options.cumulativeImpressionsSeries) {
    const cumulativePoints = options.cumulativeImpressionsSeries.map(
      (value, index): [number, number] => [START_MS + index * DAY_MS, value]
    );
    lines.push(seriesChunk('54', 'Impressions', cumulativePoints));
  }

  lines.push(textChunk('61', String(engagements), '2xlarge'));
  lines.push(textChunk('62', 'Engagements', 'small'));
  lines.push(
    seriesChunk(
      '63',
      'Engagements',
      points.map(([x], index): [number, number] => [x, index === points.length - 1 ? engagements : 0])
    )
  );

  if (options.socialRows !== false) {
    lines.push(textChunk('78', 'Social engagements', 'small'));
    lines.push(textChunk('7a', 'Reactions', 'small'));
    lines.push(paragraphChunk('7b', String(options.reactions ?? 2)));
    lines.push(textChunk('7d', 'Comments', 'small'));
    lines.push(paragraphChunk('7e', '1'));
    lines.push(textChunk('80', 'Reposts', 'small'));
    lines.push(paragraphChunk('81', '0'));
    lines.push(textChunk('83', 'Saves', 'small'));
    lines.push(paragraphChunk('84', '3'));
    lines.push(textChunk('86', 'Sends on LinkedIn', 'small'));
    lines.push(paragraphChunk('87', '1'));
  }

  return lines.join('\n');
}
