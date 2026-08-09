import type { ConnectionsFollowersMode, ConnectionsFollowersPoint } from '../types';

const PLOT_LEFT = 62;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 210;
const PLOT_WIDTH = 912;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;

export const CONNECTIONS_CHART_LAYOUT = {
  plotLeft: PLOT_LEFT,
  plotTop: PLOT_TOP,
  plotBottom: PLOT_BOTTOM,
  plotWidth: PLOT_WIDTH,
  plotHeight: PLOT_HEIGHT,
};

export function getNiceChartMax(value: number): number {
  if (value <= 0) return 10;
  const paddedValue = value * 1.12;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(paddedValue)) - 1);
  return Math.ceil(paddedValue / magnitude) * magnitude;
}

export function getChartValues(points: ConnectionsFollowersPoint[], mode: ConnectionsFollowersMode): number[] {
  const values: number[] = [];
  points.forEach((point) => {
    if ((mode === 'both' || mode === 'connections') && typeof point.connectionsCount === 'number') {
      values.push(point.connectionsCount);
    }
    if ((mode === 'both' || mode === 'followers') && typeof point.followersCount === 'number') {
      values.push(point.followersCount);
    }
  });
  return values;
}

export function getSeriesPath(
  points: ConnectionsFollowersPoint[],
  key: 'connectionsCount' | 'followersCount',
  chartMax: number
): string {
  const maxIndex = Math.max(1, points.length - 1);
  const values = points
    .map((point, index) => ({ index, value: point[key] }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number');
  if (values.length < 2) return '';

  return values
    .map((point, pathIndex) => {
      const x = PLOT_LEFT + (point.index / maxIndex) * PLOT_WIDTH;
      const y = PLOT_TOP + (1 - point.value / chartMax) * PLOT_HEIGHT;
      return `${pathIndex === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function getSeriesAreaPath(
  points: ConnectionsFollowersPoint[],
  key: 'connectionsCount' | 'followersCount',
  chartMax: number
): string {
  const linePath = getSeriesPath(points, key, chartMax);
  if (!linePath) return '';

  const maxIndex = Math.max(1, points.length - 1);
  const valuedIndexes = points
    .map((point, index) => ({ index, value: point[key] }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number');
  const firstX = PLOT_LEFT + (valuedIndexes[0].index / maxIndex) * PLOT_WIDTH;
  const lastX = PLOT_LEFT + (valuedIndexes[valuedIndexes.length - 1].index / maxIndex) * PLOT_WIDTH;
  return `${linePath} L ${lastX.toFixed(2)} ${PLOT_BOTTOM} L ${firstX.toFixed(2)} ${PLOT_BOTTOM} Z`;
}

export function getSingleSeriesPoint(
  points: ConnectionsFollowersPoint[],
  key: 'connectionsCount' | 'followersCount'
): { index: number; value: number } | null {
  const values = points
    .map((point, index) => ({ index, value: point[key] }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number');
  return values.length === 1 ? values[0] : null;
}

export function getXAxisTickIndexes(points: ConnectionsFollowersPoint[]): number[] {
  if (points.length <= 1) return [0];
  const tickCount = Math.min(8, Math.max(2, Math.ceil(points.length / 5)));
  return Array.from({ length: tickCount }, (_, index) =>
    Math.round((index / Math.max(1, tickCount - 1)) * (points.length - 1))
  ).filter((value, index, values) => values.indexOf(value) === index);
}
