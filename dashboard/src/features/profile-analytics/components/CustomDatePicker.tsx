import {
  addDays,
  addMonths,
  endOfDay,
  isInDateRange,
  isSameDay,
  startOfDay,
  type DateRange,
} from '../../../utils/date';
import { formatShortDate } from '../../../utils/format';
import type { DateRangeBoundary } from '../types';

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface CustomDatePickerProps {
  customRange: DateRange;
  visibleMonth: Date;
  activeBoundary: DateRangeBoundary;
  onVisibleMonthChange: (date: Date) => void;
  onActiveBoundaryChange: (boundary: DateRangeBoundary) => void;
  onRangeChange: (range: DateRange) => void;
}

function buildCalendarDays(month: Date): Date[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(firstDay, -firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function CustomDatePicker({
  customRange,
  visibleMonth,
  activeBoundary,
  onVisibleMonthChange,
  onActiveBoundaryChange,
  onRangeChange,
}: CustomDatePickerProps) {
  const days = buildCalendarDays(visibleMonth);

  function selectDay(day: Date) {
    const selected = startOfDay(day);
    if (activeBoundary === 'start') {
      onRangeChange({
        start: selected,
        end: selected.getTime() > customRange.end.getTime() ? endOfDay(selected) : customRange.end,
      });
      onActiveBoundaryChange('end');
      return;
    }

    const end = endOfDay(selected);
    onRangeChange({
      start: end.getTime() < customRange.start.getTime() ? selected : customRange.start,
      end,
    });
  }

  return (
    <div className="profile-analytics-date-popover">
      <div className="profile-analytics-date-fields">
        <button
          className={activeBoundary === 'start' ? 'is-active' : ''}
          type="button"
          onClick={() => onActiveBoundaryChange('start')}
        >
          From: {formatShortDate(customRange.start)}
        </button>
        <button
          className={activeBoundary === 'end' ? 'is-active' : ''}
          type="button"
          onClick={() => onActiveBoundaryChange('end')}
        >
          To: {formatShortDate(customRange.end)}
        </button>
      </div>

      <div className="profile-analytics-calendar-header">
        <button type="button" onClick={() => onVisibleMonthChange(addMonths(visibleMonth, -1))}>
          &lt;
        </button>
        <strong>{MONTH_FORMATTER.format(visibleMonth)}</strong>
        <button type="button" onClick={() => onVisibleMonthChange(addMonths(visibleMonth, 1))}>
          &gt;
        </button>
      </div>

      <div className="profile-analytics-calendar-grid profile-analytics-calendar-weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="profile-analytics-calendar-grid">
        {days.map((day) => {
          const isSelected = isSameDay(day, customRange.start) || isSameDay(day, customRange.end);
          const classes = [
            day.getMonth() !== visibleMonth.getMonth() ? 'is-muted' : '',
            isInDateRange(day, customRange) ? 'is-in-range' : '',
            isSelected ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button key={day.toISOString()} className={classes} type="button" onClick={() => selectDay(day)}>
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
