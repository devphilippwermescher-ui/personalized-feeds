import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

export interface MetricTrendPoint {
  date: Date;
  value?: number;
}

interface MetricTrendChartProps {
  title: string;
  summary: string;
  rangeLabel: string;
  icon: ReactNode;
  points: MetricTrendPoint[];
  color: string;
  gradientId: string;
  minimumMax?: number;
  valueFormatter?: (value: number | undefined) => string;
  emptyLabel: string;
}

const CHART_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
});

const PLOT_LEFT = 48;
const PLOT_TOP = 14;
const PLOT_RIGHT = 612;
const PLOT_BOTTOM = 204;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;

function formatChartDate(value: Date): string {
  return CHART_DATE_FORMATTER.format(value).replace(',', '');
}

function getNiceChartMax(value: number, minimumMax: number): number {
  const base = Math.max(value, minimumMax);
  if (base <= 10) {
    return 10;
  }

  const paddedValue = base * 1.12;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(paddedValue)) - 1);
  return Math.ceil(paddedValue / magnitude) * magnitude;
}

function getXAxisTickIndexes(points: MetricTrendPoint[]): number[] {
  if (points.length <= 1) {
    return [0];
  }

  const tickCount = Math.min(6, Math.max(2, Math.ceil(points.length / 6)));
  return Array.from({ length: tickCount }, (_, index) => (
    Math.round((index / Math.max(1, tickCount - 1)) * (points.length - 1))
  )).filter((value, index, values) => values.indexOf(value) === index);
}

function getValuePath(points: MetricTrendPoint[], chartMax: number): string {
  const maxIndex = Math.max(1, points.length - 1);
  const values = points
    .map((point, index) => ({ index, value: point.value }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number');

  if (values.length < 2) {
    return '';
  }

  return values
    .map((point, pathIndex) => {
      const x = PLOT_LEFT + (point.index / maxIndex) * PLOT_WIDTH;
      const y = PLOT_TOP + (1 - point.value / chartMax) * PLOT_HEIGHT;
      return `${pathIndex === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function getAreaPath(points: MetricTrendPoint[], chartMax: number): string {
  const linePath = getValuePath(points, chartMax);
  if (!linePath) {
    return '';
  }

  const maxIndex = Math.max(1, points.length - 1);
  const valuedIndexes = points
    .map((point, index) => ({ index, value: point.value }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number');
  const firstX = PLOT_LEFT + (valuedIndexes[0].index / maxIndex) * PLOT_WIDTH;
  const lastX = PLOT_LEFT + (valuedIndexes[valuedIndexes.length - 1].index / maxIndex) * PLOT_WIDTH;
  return `${linePath} L ${lastX.toFixed(2)} ${PLOT_BOTTOM} L ${firstX.toFixed(2)} ${PLOT_BOTTOM} Z`;
}

export function MetricTrendChart({
  title,
  summary,
  rangeLabel,
  icon,
  points,
  color,
  gradientId,
  minimumMax = 0,
  valueFormatter = (value) => (typeof value === 'number' ? value.toLocaleString() : '-'),
  emptyLabel,
}: MetricTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => typeof value === 'number');
  const hasData = values.length > 0;
  const chartMax = getNiceChartMax(Math.max(...values, 0), minimumMax);
  const yTicks = [chartMax, Math.round(chartMax * 0.5), Math.round(chartMax * 0.25), 0]
    .filter((value, index, list) => list.indexOf(value) === index);
  const xTicks = getXAxisTickIndexes(points);
  const maxIndex = Math.max(1, points.length - 1);
  const path = getValuePath(points, chartMax);
  const areaPath = getAreaPath(points, chartMax);
  const singlePoint = values.length === 1
    ? points.map((point, index) => ({ point, index })).find(({ point }) => typeof point.value === 'number') || null
    : null;
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex];

  function getX(index: number): number {
    return PLOT_LEFT + (index / maxIndex) * PLOT_WIDTH;
  }

  function getY(value: number): number {
    return PLOT_TOP + (1 - value / chartMax) * PLOT_HEIGHT;
  }

  function handlePointerMove(event: ReactMouseEvent<SVGSVGElement>) {
    if (!points.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 640;
    const clampedX = Math.max(PLOT_LEFT, Math.min(PLOT_RIGHT, x));
    const index = Math.round(((clampedX - PLOT_LEFT) / PLOT_WIDTH) * maxIndex);
    setHoveredIndex(Math.max(0, Math.min(points.length - 1, index)));
  }

  const tooltipX = hoveredIndex === null ? 0 : getX(hoveredIndex);
  const tooltipLeft = Math.min(Math.max(tooltipX + 10, PLOT_LEFT), 472);

  return (
    <section className="profile-analytics-card profile-analytics-metric-trend-card">
      <div className="profile-analytics-metric-trend-header">
        <div className="profile-analytics-metric-trend-title" style={{ color }}>
          {icon}
          <h2>{title}</h2>
          <span>{summary}</span>
          <span className="profile-analytics-metric-trend-range">{rangeLabel}</span>
        </div>
      </div>
      <div className="profile-analytics-metric-line-chart">
        {hasData ? (
          <svg
            viewBox="0 0 640 250"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0.03" />
              </linearGradient>
            </defs>
            {yTicks.map((tick) => {
              const y = getY(tick);
              return (
                <g key={tick}>
                  <text x="38" y={y + 4} textAnchor="end" className="profile-analytics-chart-axis-text">
                    {tick.toLocaleString()}
                  </text>
                  <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y} y2={y} className="profile-analytics-chart-grid-line" />
                </g>
              );
            })}
            {xTicks.map((index) => {
              const x = getX(index);
              return (
                <g key={`${points[index].date.toISOString()}-${index}`}>
                  <line x1={x} x2={x} y1={PLOT_TOP} y2={PLOT_BOTTOM} className="profile-analytics-chart-grid-line" />
                  <text x={x} y="224" textAnchor="middle" className="profile-analytics-chart-axis-text">
                    {formatChartDate(points[index].date)}
                  </text>
                </g>
              );
            })}
            <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} className="profile-analytics-chart-axis-line" />
            {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
            {path ? <path d={path} className="profile-analytics-series" stroke={color} /> : null}
            {singlePoint && typeof singlePoint.point.value === 'number' ? (
              <circle cx={getX(singlePoint.index)} cy={getY(singlePoint.point.value)} r="4" fill={color} className="profile-analytics-chart-dot" />
            ) : null}
            {hoveredPoint ? (
              <g>
                <line x1={tooltipX} x2={tooltipX} y1={PLOT_TOP} y2={PLOT_BOTTOM} className="profile-analytics-chart-hover-line" />
                {typeof hoveredPoint.value === 'number' ? (
                  <circle cx={tooltipX} cy={getY(hoveredPoint.value)} r="4" fill={color} className="profile-analytics-chart-dot" />
                ) : null}
                <g transform={`translate(${tooltipLeft} 76)`}>
                  <rect width="126" height="62" rx="6" className="profile-analytics-chart-tooltip-bg" />
                  <text x="13" y="23" className="profile-analytics-chart-tooltip-date">
                    {formatChartDate(hoveredPoint.date)}
                  </text>
                  <text x="13" y="48" fill={color} className="profile-analytics-chart-tooltip-value">
                    {title}: {valueFormatter(hoveredPoint.value)}
                  </text>
                </g>
              </g>
            ) : null}
          </svg>
        ) : (
          <div className="profile-analytics-chart-empty">{emptyLabel}</div>
        )}
      </div>
    </section>
  );
}