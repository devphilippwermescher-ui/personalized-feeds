import { useEffect, useRef } from 'react';
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
  disabled?: boolean;
  onPresetSelect: (range: TimeRangeKey) => void;
  onCustomToggle: () => void;
  onCustomClose: () => void;
  onVisibleMonthChange: (date: Date) => void;
  onActiveBoundaryChange: (boundary: DateRangeBoundary) => void;
  onCustomRangeChange: (range: DateRange) => void;
  onReset: () => void;
}

export function AnalyticsDateRangeControl(props: AnalyticsDateRangeControlProps) {
  const customDateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.isCustomPickerOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !customDateRef.current?.contains(event.target)) {
        props.onCustomClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') props.onCustomClose();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [props.isCustomPickerOpen, props.onCustomClose]);

  useEffect(() => {
    if (props.disabled && props.isCustomPickerOpen) props.onCustomClose();
  }, [props.disabled, props.isCustomPickerOpen, props.onCustomClose]);

  return (
    <div className="profile-analytics-range-control" aria-label="Analytics time range">
      {TIME_RANGES.map((item) => (
        <button
          key={item.key}
          className={item.key === props.range ? 'is-active' : ''}
          type="button"
          disabled={props.disabled}
          onClick={() => props.onPresetSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
      <div ref={customDateRef} className="profile-analytics-custom-date">
        <button
          className={props.range === 'custom' ? 'is-active' : ''}
          type="button"
          disabled={props.disabled}
          aria-expanded={props.isCustomPickerOpen}
          aria-controls="profile-analytics-custom-date-picker"
          onClick={props.onCustomToggle}
        >
          <HiOutlineCalendarDays />
          Custom Date
        </button>
        {props.isCustomPickerOpen ? (
          <CustomDatePicker
            id="profile-analytics-custom-date-picker"
            customRange={props.customRange}
            visibleMonth={props.visibleMonth}
            activeBoundary={props.activeBoundary}
            onVisibleMonthChange={props.onVisibleMonthChange}
            onActiveBoundaryChange={props.onActiveBoundaryChange}
            onRangeChange={props.onCustomRangeChange}
          />
        ) : null}
      </div>
      <span className="profile-analytics-range-reset-wrap">
        <button
          className="profile-analytics-range-reset"
          type="button"
          disabled={props.disabled}
          aria-label="Reset cards and charts to Total"
          aria-describedby="profile-analytics-range-reset-tooltip"
          onClick={props.onReset}
        >
          <HiOutlineArrowPath />
        </button>
        <span
          id="profile-analytics-range-reset-tooltip"
          className="profile-analytics-range-reset-tooltip"
          role="tooltip"
        >
          Returns all cards and charts to Total values and clears the selected date range.
        </span>
      </span>
    </div>
  );
}
