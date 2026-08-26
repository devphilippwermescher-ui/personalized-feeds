import { useEffect, useRef, type ReactNode } from 'react';
import { HiOutlineCalendarDays } from 'react-icons/hi2';
import type { DateRange } from '../utils/date';
import { DateRangeCalendar, type DateRangeBoundary } from './DateRangeCalendar';

export interface AnalyticsRangeOption<TKey extends string> {
  key: TKey;
  label: string;
}

export interface AnalyticsRangeTrailingAction {
  icon: ReactNode;
  /** Accessible name for the icon-only button. */
  label: string;
  tooltip: string;
  onClick: () => void;
  busy?: boolean;
}

interface AnalyticsRangeControlProps<TKey extends string> {
  /** Distinguishes the popover and tooltip ids when two controls coexist. */
  idPrefix: string;
  ariaLabel: string;
  options: Array<AnalyticsRangeOption<TKey>>;
  activeKey: string;
  customRange: DateRange;
  isCustomPickerOpen: boolean;
  activeBoundary: DateRangeBoundary;
  visibleMonth: Date;
  disabled?: boolean;
  trailingAction?: AnalyticsRangeTrailingAction;
  onPresetSelect: (key: TKey) => void;
  onCustomToggle: () => void;
  onCustomClose: () => void;
  onVisibleMonthChange: (date: Date) => void;
  onActiveBoundaryChange: (boundary: DateRangeBoundary) => void;
  onCustomRangeChange: (range: DateRange) => void;
}

/**
 * Preset buttons plus the custom-date popover, shared across analytics pages.
 *
 * The trailing icon button is supplied by the caller because each surface uses
 * it differently. Both analytics pages currently use it to reset to Total,
 * while keeping the shared control independent from that product meaning.
 */
export function AnalyticsRangeControl<TKey extends string>(props: AnalyticsRangeControlProps<TKey>) {
  const customDateRef = useRef<HTMLDivElement>(null);
  const { isCustomPickerOpen, onCustomClose, disabled } = props;

  useEffect(() => {
    if (!isCustomPickerOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !customDateRef.current?.contains(event.target)) onCustomClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCustomClose();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCustomPickerOpen, onCustomClose]);

  useEffect(() => {
    if (disabled && isCustomPickerOpen) onCustomClose();
  }, [disabled, isCustomPickerOpen, onCustomClose]);

  const pickerId = `${props.idPrefix}-custom-date-picker`;
  const tooltipId = `${props.idPrefix}-range-action-tooltip`;

  return (
    <div className="analytics-range-control" aria-label={props.ariaLabel}>
      {props.options.map((option) => (
        <button
          key={option.key}
          className={option.key === props.activeKey ? 'is-active' : ''}
          type="button"
          disabled={props.disabled}
          onClick={() => props.onPresetSelect(option.key)}
        >
          {option.label}
        </button>
      ))}
      <div ref={customDateRef} className="analytics-custom-date">
        <button
          className={props.activeKey === 'custom' ? 'is-active' : ''}
          type="button"
          disabled={props.disabled}
          aria-expanded={props.isCustomPickerOpen}
          aria-controls={pickerId}
          onClick={props.onCustomToggle}
        >
          <HiOutlineCalendarDays />
          Custom Date
        </button>
        {props.isCustomPickerOpen ? (
          <DateRangeCalendar
            id={pickerId}
            customRange={props.customRange}
            visibleMonth={props.visibleMonth}
            activeBoundary={props.activeBoundary}
            onVisibleMonthChange={props.onVisibleMonthChange}
            onActiveBoundaryChange={props.onActiveBoundaryChange}
            onRangeChange={props.onCustomRangeChange}
          />
        ) : null}
      </div>
      {props.trailingAction ? (
        <span className="analytics-range-reset-wrap">
          <button
            className={`analytics-range-reset${props.trailingAction.busy ? ' is-busy' : ''}`}
            type="button"
            disabled={props.disabled || props.trailingAction.busy}
            aria-label={props.trailingAction.label}
            aria-describedby={tooltipId}
            onClick={props.trailingAction.onClick}
          >
            {props.trailingAction.icon}
          </button>
          <span id={tooltipId} className="analytics-range-reset-tooltip" role="tooltip">
            {props.trailingAction.tooltip}
          </span>
        </span>
      ) : null}
    </div>
  );
}
