export function zoomToRelevantMetricPoints<T extends { value?: number }>(points: T[]): T[] {
  const firstDataIndex = points.findIndex((point) => typeof point.value === 'number' && point.value > 0);
  if (firstDataIndex <= 0) return points;

  // Keep one preceding point so a newly observed value still has visual
  // context without stretching a few recent observations across many months.
  return points.slice(Math.max(0, firstDataIndex - 1));
}
