import {
  addDays,
  addMonths,
  endOfDay,
  isInDateRange,
  isSameDay,
  startOfDay,
  type DateRange,
} from '../utils/date';
import { formatShortDate } from '../utils/format';

export type DateRangeBoundary = 'start' | 'end';

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long' });
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const EARLIEST_LINKEDIN_YEAR = 2003;
const MONTHS = Array.from({ length: 12 }, (_, month) => ({
  month,
  label: MONTH_FORMATTER.format(new Date(2000, month, 1)),
}));

interface DateRangeCalendarProps {
  id: string;
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

/**
 * Two-boundary range calendar shared by every analytics surface.
 *
 * Features supply their own defaults and range semantics; only the calendar
 * itself is shared, so Profile and Content Analytics cannot drift apart
 * visually while still owning their own range meaning.
 */
export function DateRangeCalendar({
  id,
  customRange,
  visibleMonth,
  activeBoundary,
  onVisibleMonthChange,
  onActiveBoundaryChange,
  onRangeChange,
}: DateRangeCalendarProps) {
  const days = buildCalendarDays(visibleMonth);
  const today = startOfDay(new Date());
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const visibleMonthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const nextMonthDisabled = visibleMonthStart.getTime() >= currentMonth.getTime();
  const availableYears = Array.from(
    { length: today.getFullYear() - EARLIEST_LINKEDIN_YEAR + 1 },
    (_, index) => today.getFullYear() - index
  );

  function changeVisiblePeriod(year: number, month: number) {
    const nextMonth =
      year === today.getFullYear() ? Math.min(month, today.getMonth()) : month;
    onVisibleMonthChange(new Date(year, nextMonth, 1));
  }

  function selectDay(day: Date) {
    const selected = startOfDay(day);
    if (selected.getTime() > today.getTime()) return;
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
    <div id={id} className="analytics-date-popover">
      <div className="analytics-date-fields">
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

      <div className="analytics-calendar-header">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onVisibleMonthChange(addMonths(visibleMonth, -1))}
        >
          &lt;
        </button>
        <div className="analytics-calendar-period-selects">
          <label>
            <span className="analytics-visually-hidden">Month</span>
            <select
              aria-label="Calendar month"
              value={visibleMonth.getMonth()}
              onChange={(event) =>
                changeVisiblePeriod(visibleMonth.getFullYear(), Number(event.target.value))
              }
            >
              {MONTHS.map((item) => (
                <option
                  key={item.month}
                  value={item.month}
                  disabled={
                    visibleMonth.getFullYear() === today.getFullYear() &&
                    item.month > today.getMonth()
                  }
                >
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="analytics-visually-hidden">Year</span>
            <select
              aria-label="Calendar year"
              value={visibleMonth.getFullYear()}
              onChange={(event) =>
                changeVisiblePeriod(Number(event.target.value), visibleMonth.getMonth())
              }
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={nextMonthDisabled}
          aria-label="Next month"
          onClick={() => onVisibleMonthChange(addMonths(visibleMonth, 1))}
        >
          &gt;
        </button>
      </div>

      <div className="analytics-calendar-grid analytics-calendar-weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="analytics-calendar-grid">
        {days.map((day) => {
          const isFuture = startOfDay(day).getTime() > today.getTime();
          const isSelected = isSameDay(day, customRange.start) || isSameDay(day, customRange.end);
          const classes = [
            day.getMonth() !== visibleMonth.getMonth() ? 'is-muted' : '',
            isInDateRange(day, customRange) ? 'is-in-range' : '',
            isSelected ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={day.toISOString()}
              className={classes}
              type="button"
              disabled={isFuture}
              aria-label={`${formatShortDate(day)}${isFuture ? ', future date unavailable' : ''}`}
              aria-current={isSameDay(day, today) ? 'date' : undefined}
              onClick={() => selectDay(day)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
