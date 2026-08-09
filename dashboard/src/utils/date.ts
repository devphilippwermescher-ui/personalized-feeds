export interface DateRange {
  start: Date;
  end: Date;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function addMonths(value: Date, months: number): Date {
  const date = new Date(value);
  date.setMonth(date.getMonth() + months);
  return date;
}

export function getDateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

export function parseDate(value: string): Date | null {
  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return startOfDay(new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? startOfDay(new Date(timestamp)) : null;
}

export function getPresetRange(days: number): DateRange {
  const end = endOfDay(new Date());
  return { start: startOfDay(addDays(end, -days)), end };
}

export function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function isInDateRange(day: Date, range: DateRange): boolean {
  const timestamp = startOfDay(day).getTime();
  return timestamp >= startOfDay(range.start).getTime() && timestamp <= startOfDay(range.end).getTime();
}
