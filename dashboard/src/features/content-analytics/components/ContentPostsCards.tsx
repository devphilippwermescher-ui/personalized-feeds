import { HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';
import { formatNumber, formatShortDate } from '../../../utils/format';
import { formatEngagementRate } from '../hooks/useContentAnalyticsViewModel';
import type { ContentPostRow } from '../types';

interface ContentPostsCardsProps {
  rows: ContentPostRow[];
}

const CARD_METRICS: Array<{ label: string; read: (row: ContentPostRow) => string }> = [
  { label: 'Impressions', read: (row) => formatMetric(row.metrics.impressions) },
  { label: 'Reactions', read: (row) => formatMetric(row.metrics.reactions) },
  { label: 'Comments', read: (row) => formatMetric(row.metrics.comments) },
  { label: 'Reposts', read: (row) => formatMetric(row.metrics.reposts) },
  { label: 'Eng. Rate', read: (row) => formatEngagementRate(row.engagementRate) },
];

function formatMetric(value: number | undefined): string {
  return typeof value === 'number' ? formatNumber(value) : '—';
}

export function ContentPostsCards({ rows }: ContentPostsCardsProps) {
  return (
    <div className="content-analytics-cards-grid">
      {rows.map((row) => (
        <article key={row.id} className="content-analytics-post-card">
          <header>
            <span className="content-analytics-post-card-date">{formatShortDate(row.publishedAt)}</span>
            <a
              href={row.post.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open "${row.title}" on LinkedIn`}
            >
              <HiOutlineArrowTopRightOnSquare />
            </a>
          </header>
          <p className="content-analytics-post-card-text">{row.post.text}</p>
          <dl className="content-analytics-post-card-metrics">
            {CARD_METRICS.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>{metric.read(row)}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
