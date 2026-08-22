import { HiOutlineArrowPath } from 'react-icons/hi2';
import { AnalyticsRangeControl } from '../../../components/AnalyticsRangeControl';
import { TIME_RANGES } from '../constants';
import type { DateRange } from '../../../utils/date';
import type { ActiveRangeKey, DateRangeBoundary, TimeRangeKey } from '../types';

interface AnalyticsDateRangeControlProps {
  range: ActiveRangeKey;
  customRange: DateRange;
  isCustomPickerOpen: boolean;
  activeBoundary: DateRangeBoundary;
  visibleMonth: Date;
  disabled?: boolean;
  onPresetSelect: (range: TimeRangeKey) => void;
  onCustomToggle: () => void;
  onCustomClose: () => void;
  onVisibleMonthChange: (date: Date) => void;
  onActiveBoundaryChange: (boundary: DateRangeBoundary) => void;
  onCustomRangeChange: (range: DateRange) => void;
  onReset: () => void;
}

/** Profile Analytics adapter: presets plus a reset-to-Total trailing action. */
export function AnalyticsDateRangeControl(props: AnalyticsDateRangeControlProps) {
  return (
    <AnalyticsRangeControl
      idPrefix="profile-analytics"
      ariaLabel="Analytics time range"
      options={TIME_RANGES.map((item) => ({ key: item.key, label: item.label }))}
      activeKey={props.range}
      customRange={props.customRange}
      isCustomPickerOpen={props.isCustomPickerOpen}
      activeBoundary={props.activeBoundary}
      visibleMonth={props.visibleMonth}
      disabled={props.disabled}
      trailingAction={{
        icon: <HiOutlineArrowPath />,
        label: 'Reset cards and charts to Total',
        tooltip: 'Returns all cards and charts to Total values and clears the selected date range.',
        onClick: props.onReset,
      }}
      onPresetSelect={props.onPresetSelect}
      onCustomToggle={props.onCustomToggle}
      onCustomClose={props.onCustomClose}
      onVisibleMonthChange={props.onVisibleMonthChange}
      onActiveBoundaryChange={props.onActiveBoundaryChange}
      onCustomRangeChange={props.onCustomRangeChange}
    />
  );
}
