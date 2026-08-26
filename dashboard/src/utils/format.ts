const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const CHART_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
});

const CHART_DATE_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatShortDate(value: Date): string {
  return SHORT_DATE_FORMATTER.format(value).replace(',', '');
}

export function formatChartDate(value: Date, includeYear = false): string {
  const formatter = includeYear ? CHART_DATE_WITH_YEAR_FORMATTER : CHART_DATE_FORMATTER;
  return formatter.format(value).replace(',', '');
}

export function formatNumber(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '-';
}

export function formatPercent(value: number | undefined): string {
  return typeof value === 'number' ? `${Math.round(value)}%` : '-';
}
