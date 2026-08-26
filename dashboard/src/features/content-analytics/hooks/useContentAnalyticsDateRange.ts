import { useDateRangeSelection } from '../../../hooks/useDateRangeSelection';
import { CONTENT_TIME_RANGES } from '../constants';
import type { ActiveContentRangeKey, ContentRangeKey } from '../types';

/**
 * Content Analytics defaults to Total, matching Profile Analytics. Total is
 * resolved by the view model to the widest successfully collected LinkedIn
 * snapshot; choosing a preset or custom window switches to that range only.
 */
export function useContentAnalyticsDateRange() {
  const selection = useDateRangeSelection<ContentRangeKey, 'total'>({
    presets: CONTENT_TIME_RANGES,
    defaultRange: 'total',
    defaultRangeLabel: 'Total',
  });

  return { ...selection, range: selection.range as ActiveContentRangeKey };
}
