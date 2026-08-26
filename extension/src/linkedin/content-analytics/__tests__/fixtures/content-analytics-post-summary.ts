/** Minimal anonymised `analytics/post-summary` RSC stream. */
function textChunk(id: string, text: string, fontSize: 'small' | '2xlarge'): string {
  return `${id}:["$","$Lxx",null,{"textProps":{"fontSize":"${fontSize}","fontWeight":"${
    fontSize === '2xlarge' ? 'bold' : 'normal'
  }","children":["${text}"]}}]`;
}

function paragraphChunk(id: string, text: string): string {
  return `${id}:["$","p",null,{"className":"anon","children":["${text}"]}]`;
}

export interface PostSummaryFixtureOptions {
  impressions?: number;
  reactions?: number;
  omitImpressions?: boolean;
}

export function buildPostSummaryRscFixture(options: PostSummaryFixtureOptions = {}): string {
  const lines = ['1:"$Sreact.fragment"', '3:I["anonymised-component-id",[],"Screen"]'];
  if (!options.omitImpressions) {
    lines.push(textChunk('32', String(options.impressions ?? 1245), '2xlarge'));
    lines.push(textChunk('33', 'Impressions', 'small'));
  }
  lines.push(textChunk('3a', '6', '2xlarge'));
  lines.push(textChunk('3b', 'Profile viewers from this post', 'small'));
  lines.push(textChunk('3c', '2', '2xlarge'));
  lines.push(textChunk('3d', 'Followers gained from this post', 'small'));
  lines.push(textChunk('43', 'Reactions', 'small'));
  lines.push(paragraphChunk('44', String(options.reactions ?? 8)));
  lines.push(textChunk('46', 'Comments', 'small'));
  lines.push(paragraphChunk('47', '3'));
  lines.push(textChunk('49', 'Reposts', 'small'));
  lines.push(paragraphChunk('4a', '1'));
  lines.push(textChunk('4c', 'Saves', 'small'));
  lines.push(paragraphChunk('4d', '4'));
  lines.push(textChunk('4f', 'Sends on LinkedIn', 'small'));
  lines.push(paragraphChunk('50', '0'));
  return lines.join('\n');
}
