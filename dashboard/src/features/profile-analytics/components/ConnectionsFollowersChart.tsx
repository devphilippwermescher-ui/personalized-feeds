import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { HiOutlineUserGroup } from 'react-icons/hi2';
import { formatChartDate, formatNumber } from '../../../utils/format';
import type { ConnectionsFollowersMode, ConnectionsFollowersPoint } from '../types';
import {
  CONNECTIONS_CHART_LAYOUT,
  getChartValues,
  getNiceChartMax,
  getSeriesAreaPath,
  getSeriesPath,
  getSingleSeriesPoint,
  getXAxisTickIndexes,
} from '../utils/connections-chart';

interface ConnectionsFollowersChartProps {
  points: ConnectionsFollowersPoint[];
  rangeLabel: string;
}

const MODES: Array<{ key: ConnectionsFollowersMode; label: string }> = [
  { key: 'both', label: 'Both' },
  { key: 'connections', label: 'Connections' },
  { key: 'followers', label: 'Followers' },
];

export function ConnectionsFollowersChart({ points, rangeLabel }: ConnectionsFollowersChartProps) {
  const [mode, setMode] = useState<ConnectionsFollowersMode>('both');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const values = getChartValues(points, mode);
  const chartMax = getNiceChartMax(Math.max(...values, 0));
  const yTicks = [chartMax, Math.round(chartMax * 0.5), Math.round(chartMax * 0.25), 0].filter(
    (value, index, list) => list.indexOf(value) === index
  );
  const xTicks = getXAxisTickIndexes(points);
  const maxIndex = Math.max(1, points.length - 1);
  const connectionsPath = getSeriesPath(points, 'connectionsCount', chartMax);
  const followersPath = getSeriesPath(points, 'followersCount', chartMax);
  const connectionsAreaPath = getSeriesAreaPath(points, 'connectionsCount', chartMax);
  const followersAreaPath = getSeriesAreaPath(points, 'followersCount', chartMax);
  const singleConnectionsPoint = getSingleSeriesPoint(points, 'connectionsCount');
  const singleFollowersPoint = getSingleSeriesPoint(points, 'followersCount');
  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;
  const showConnections = mode === 'both' || mode === 'connections';
  const showFollowers = mode === 'both' || mode === 'followers';
  const { plotLeft, plotTop, plotBottom, plotWidth, plotHeight } = CONNECTIONS_CHART_LAYOUT;

  function getX(index: number): number {
    return plotLeft + (index / maxIndex) * plotWidth;
  }

  function getY(value: number): number {
    return plotTop + (1 - value / chartMax) * plotHeight;
  }

  function handlePointerMove(event: ReactMouseEvent<SVGSVGElement>) {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 1000;
    const clampedX = Math.max(plotLeft, Math.min(plotLeft + plotWidth, x));
    const index = Math.round(((clampedX - plotLeft) / plotWidth) * maxIndex);
    setHoveredIndex(Math.max(0, Math.min(points.length - 1, index)));
  }

  const tooltipX = hoveredIndex !== null ? getX(hoveredIndex) : 0;
  const tooltipLeft = Math.min(Math.max(tooltipX + 12, plotLeft), 802);

  return (
    <section className="profile-analytics-card profile-analytics-card--wide profile-analytics-trend-card">
      <div className="profile-analytics-trend-header">
        <div className="profile-analytics-trend-title">
          <HiOutlineUserGroup />
          <h2>Connections & Followers</h2>
          <span>{rangeLabel}</span>
        </div>
        <div className="profile-analytics-chart-tabs" aria-label="Connections followers chart mode">
          {MODES.map((item) => (
            <button
              key={item.key}
              className={mode === item.key ? 'is-active' : ''}
              type="button"
              onClick={() => setMode(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="profile-analytics-line-chart">
        {values.length > 0 ? (
          <svg
            viewBox="0 0 1000 270"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <defs>
              <linearGradient id="connectionsAreaGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#0A66C2" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#0A66C2" stopOpacity="0.03" />
              </linearGradient>
              <linearGradient id="followersAreaGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#19b8bf" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#19b8bf" stopOpacity="0.03" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="1000" height="270" fill="#fff" />

            {yTicks.map((tick) => {
              const y = getY(tick);
              return (
                <g key={tick}>
                  <text x="44" y={y + 4} textAnchor="end" className="profile-analytics-chart-axis-text">
                    {tick.toLocaleString()}
                  </text>
                  <line
                    x1={plotLeft}
                    x2={plotLeft + plotWidth}
                    y1={y}
                    y2={y}
                    className="profile-analytics-chart-grid-line"
                  />
                </g>
              );
            })}

            {xTicks.map((index) => {
              const x = getX(index);
              return (
                <g key={points[index].dateKey}>
                  <line x1={x} x2={x} y1={plotTop} y2={plotBottom} className="profile-analytics-chart-grid-line" />
                  <text x={x} y="236" textAnchor="middle" className="profile-analytics-chart-axis-text">
                    {formatChartDate(points[index].date)}
                  </text>
                </g>
              );
            })}

            <line
              x1={plotLeft}
              x2={plotLeft + plotWidth}
              y1={plotBottom}
              y2={plotBottom}
              className="profile-analytics-chart-axis-line"
            />
            {showConnections && connectionsAreaPath ? (
              <path d={connectionsAreaPath} fill="url(#connectionsAreaGradient)" />
            ) : null}
            {showFollowers && followersAreaPath ? (
              <path d={followersAreaPath} fill="url(#followersAreaGradient)" />
            ) : null}
            {showConnections && connectionsPath ? (
              <path d={connectionsPath} className="profile-analytics-series profile-analytics-series--connections" />
            ) : null}
            {showFollowers && followersPath ? (
              <path d={followersPath} className="profile-analytics-series profile-analytics-series--followers" />
            ) : null}
            {showConnections && singleConnectionsPoint ? (
              <circle
                cx={getX(singleConnectionsPoint.index)}
                cy={getY(singleConnectionsPoint.value)}
                r="4"
                className="profile-analytics-chart-dot profile-analytics-chart-dot--connections"
              />
            ) : null}
            {showFollowers && singleFollowersPoint ? (
              <circle
                cx={getX(singleFollowersPoint.index)}
                cy={getY(singleFollowersPoint.value)}
                r="4"
                className="profile-analytics-chart-dot profile-analytics-chart-dot--followers"
              />
            ) : null}

            {hoveredPoint ? (
              <g>
                <line
                  x1={tooltipX}
                  x2={tooltipX}
                  y1={plotTop}
                  y2={plotBottom}
                  className="profile-analytics-chart-hover-line"
                />
                {showConnections && typeof hoveredPoint.connectionsCount === 'number' ? (
                  <circle
                    cx={tooltipX}
                    cy={getY(hoveredPoint.connectionsCount)}
                    r="4"
                    className="profile-analytics-chart-dot profile-analytics-chart-dot--connections"
                  />
                ) : null}
                {showFollowers && typeof hoveredPoint.followersCount === 'number' ? (
                  <circle
                    cx={tooltipX}
                    cy={getY(hoveredPoint.followersCount)}
                    r="4"
                    className="profile-analytics-chart-dot profile-analytics-chart-dot--followers"
                  />
                ) : null}

                <g transform={`translate(${tooltipLeft} 92)`}>
                  <rect
                    width="172"
                    height={mode === 'both' ? 84 : 62}
                    rx="6"
                    className="profile-analytics-chart-tooltip-bg"
                  />
                  <text x="14" y="23" className="profile-analytics-chart-tooltip-date">
                    {formatChartDate(hoveredPoint.date)}
                  </text>
                  {showConnections ? (
                    <text x="14" y="48" className="profile-analytics-chart-tooltip-connections">
                      Connections : {formatNumber(hoveredPoint.connectionsCount)}
                    </text>
                  ) : null}
                  {showFollowers ? (
                    <text x="14" y={showConnections ? 72 : 48} className="profile-analytics-chart-tooltip-followers">
                      Followers : {formatNumber(hoveredPoint.followersCount)}
                    </text>
                  ) : null}
                </g>
              </g>
            ) : null}

            <text
              x="24"
              y="112"
              textAnchor="middle"
              transform="rotate(-90 24 112)"
              className="profile-analytics-chart-axis-label"
            >
              Count
            </text>
            <text x="518" y="264" textAnchor="middle" className="profile-analytics-chart-axis-label">
              Date
            </text>
          </svg>
        ) : (
          <div className="profile-analytics-chart-empty">No connection trend yet</div>
        )}
      </div>
    </section>
  );
}
