import type { TimeRangeKey } from './types';

export const TIME_RANGES: Array<{ key: TimeRangeKey; label: string; days: number }> = [
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: '6m', label: '6 months', days: 183 },
  { key: '1y', label: '1 year', days: 365 },
];
