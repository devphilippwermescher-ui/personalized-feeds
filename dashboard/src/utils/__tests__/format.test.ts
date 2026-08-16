import { describe, expect, it } from 'vitest';
import { formatChartDate } from '../format';

describe('formatChartDate', () => {
  const date = new Date(2025, 11, 25);

  it('keeps preset-range labels compact', () => {
    expect(formatChartDate(date)).toBe('25 Dec');
  });

  it('includes the year for total-range labels', () => {
    expect(formatChartDate(date, true)).toBe('25 Dec 2025');
  });
});
