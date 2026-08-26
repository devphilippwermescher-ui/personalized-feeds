import { HiOutlineArrowPath } from 'react-icons/hi2';
import { AnalyticsRangeControl } from '../../../components/AnalyticsRangeControl';
import type { DateRange } from '../../../utils/date';
import type { DateRangeBoundary } from '../../../hooks/useDateRangeSelection';
import { CONTENT_TIME_RANGES } from '../constants';
import type { ActiveContentRangeKey, ContentRangeKey } from '../types';

interface ContentAnalyticsHeaderProps {
  range: ActiveContentRangeKey;
  customRange: DateRange;
  isCustomPickerOpen: boolean;
  activeBoundary: DateRangeBoundary;
  visibleMonth: Date;
  onPresetSelect: (range: ContentRangeKey) => void;
  onCustomToggle: () => void;
  onCustomClose: () => void;
  onVisibleMonthChange: (date: Date) => void;
  onActiveBoundaryChange: (boundary: DateRangeBoundary) => void;
  onCustomRangeChange: (range: DateRange) => void;
  onReset: () => void;
}

export function ContentAnalyticsHeader(props: ContentAnalyticsHeaderProps) {
  return (
    <div className="page-header content-analytics-heading">
      <div>
        <h1>Content Analytics</h1>
        <p className="page-subtitle">Your LinkedIn content at a glance</p>
      </div>
      <AnalyticsRangeControl
        idPrefix="content-analytics"
        ariaLabel="Content Analytics time range"
        options={CONTENT_TIME_RANGES.map((item) => ({ key: item.key, label: item.label }))}
        activeKey={props.range}
        customRange={props.customRange}
        isCustomPickerOpen={props.isCustomPickerOpen}
        activeBoundary={props.activeBoundary}
        visibleMonth={props.visibleMonth}
        trailingAction={{
          icon: <HiOutlineArrowPath />,
          label: 'Reset Content Analytics to Total',
          tooltip:
            'Returns all cards, the chart and the posts list to Total values and clears the selected date range.',
          onClick: props.onReset,
        }}
        onPresetSelect={props.onPresetSelect}
        onCustomToggle={props.onCustomToggle}
        onCustomClose={props.onCustomClose}
        onVisibleMonthChange={props.onVisibleMonthChange}
        onActiveBoundaryChange={props.onActiveBoundaryChange}
        onCustomRangeChange={props.onCustomRangeChange}
      />
    </div>
  );
}
