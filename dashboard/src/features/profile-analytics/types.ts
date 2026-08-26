import type { ProfileAnalyticsDailySnapshot } from 'shared/types';
import type { DateRange } from '../../utils/date';

export type ChartKey = keyof Pick<
  ProfileAnalyticsDailySnapshot,
  | 'connectionsCount'
  | 'followersCount'
  | 'profileViewsCount'
  | 'searchAppearancesCount'
  | 'socialSellingIndexScore'
  | 'acceptanceRate'
>;

export type TimeRangeKey = '30d' | '90d' | '6m' | '1y';
export type ActiveRangeKey = 'total' | TimeRangeKey | 'custom';
export type DateRangeBoundary = 'start' | 'end';
export type ConnectionsFollowersMode = 'both' | 'connections' | 'followers';

export interface ConnectionsFollowersPoint {
  date: Date;
  dateKey: string;
  connectionsCount?: number;
  connectionsAdded?: number;
  followersCount?: number;
}

export interface AnalyticsDateRangeState {
  range: ActiveRangeKey;
  rangeLabel: string;
  selectedDateRange: DateRange | null;
  customRange: DateRange;
  isCustomPickerOpen: boolean;
  activeCustomBoundary: DateRangeBoundary;
  visibleMonth: Date;
}
