import { describe, expect, it } from 'vitest';
import { zoomToRelevantMetricPoints } from '../chart-series';

describe('zoomToRelevantMetricPoints', () => {
  it('keeps one context point before sparse recent data', () => {
    const points = [0, 0, 0, 2, 2].map((value) => ({ value }));

    expect(zoomToRelevantMetricPoints(points).map((point) => point.value)).toEqual([0, 2, 2]);
  });

  it('keeps an empty plot range intact', () => {
    const points = [{ value: undefined }, { value: undefined }];

    expect(zoomToRelevantMetricPoints(points)).toBe(points);
  });
});
