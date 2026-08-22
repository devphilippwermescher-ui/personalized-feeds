import { useDateRangeSelection } from '../../../hooks/useDateRangeSelection';
import { TIME_RANGES } from '../constants';
import type { ActiveRangeKey, TimeRangeKey } from '../types';

/**
 * Profile Analytics range state. It defaults to Total, where every card shows
 * the lifetime value rather than a windowed one.
 */
export function useAnalyticsDateRange() {
  const selection = useDateRangeSelection<TimeRangeKey, 'total'>({
    presets: TIME_RANGES,
    defaultRange: 'total',
    defaultRangeLabel: 'Total',
  });

  return { ...selection, range: selection.range as ActiveRangeKey };
}
