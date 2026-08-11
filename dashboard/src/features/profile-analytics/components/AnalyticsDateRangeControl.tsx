import { HiOutlineArrowPath, HiOutlineCalendarDays } from 'react-icons/hi2';
import { TIME_RANGES } from '../constants';
import type { DateRange } from '../../../utils/date';
import type { ActiveRangeKey, DateRangeBoundary, TimeRangeKey } from '../types';
import { CustomDatePicker } from './CustomDatePicker';

interface AnalyticsDateRangeControlProps {
  range: ActiveRangeKey;
  customRange: DateRange;
  isCustomPickerOpen: boolean;
  activeBoundary: DateRangeBoundary;
  visibleMonth: Date;
  onTotalSelect: () => void;
  onPresetSelect: (range: TimeRangeKey) => void;
  onCustomToggle: () => void;
  onVisibleMonthChange: (date: Date) => void;
  onActiveBoundaryChange: (boundary: DateRangeBoundary) => void;
  onCustomRangeChange: (range: DateRange) => void;
  onReset: () => void;
}

export function AnalyticsDateRangeControl(props: AnalyticsDateRangeControlProps) {
  return (
    <div className="profile-analytics-range-control" aria-label="Analytics time range">
      <button
        className={props.range === 'total' ? 'is-active' : ''}
        type="button"
        onClick={props.onTotalSelect}
      >
        Total
      </button>
      {TIME_RANGES.map((item) => (
        <button
          key={item.key}
          className={item.key === props.range ? 'is-active' : ''}
          type="button"
          onClick={() => props.onPresetSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
      <div className="profile-analytics-custom-date">
        <button className={props.range === 'custom' ? 'is-active' : ''} type="button" onClick={props.onCustomToggle}>
          <HiOutlineCalendarDays />
          Custom Date
        </button>
        {props.isCustomPickerOpen ? (
          <CustomDatePicker
            customRange={props.customRange}
            visibleMonth={props.visibleMonth}
            activeBoundary={props.activeBoundary}
            onVisibleMonthChange={props.onVisibleMonthChange}
            onActiveBoundaryChange={props.onActiveBoundaryChange}
            onRangeChange={props.onCustomRangeChange}
          />
        ) : null}
      </div>
      <button
        className="profile-analytics-range-reset"
        type="button"
        aria-label="Reset to Total"
        title="Reset to Total"
        onClick={props.onReset}
      >
        <HiOutlineArrowPath />
      </button>
    </div>
  );
}
