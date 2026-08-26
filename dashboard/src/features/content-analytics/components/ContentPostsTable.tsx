import { HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';
import { formatNumber, formatShortDate } from '../../../utils/format';
import { formatEngagementRate } from '../hooks/useContentAnalyticsViewModel';
import type { ContentPostRow } from '../types';

interface ContentPostsTableProps {
  rows: ContentPostRow[];
}

function metricCell(value: number | undefined): string {
  return typeof value === 'number' ? formatNumber(value) : '—';
}

export function ContentPostsTable({ rows }: ContentPostsTableProps) {
  return (
    <div className="content-analytics-table-scroll">
      <table className="content-analytics-table">
        <thead>
          <tr>
            <th scope="col">Post</th>
            <th scope="col">Date</th>
            <th scope="col" className="is-numeric">
              Impressions
            </th>
            <th scope="col" className="is-numeric">
              Reactions
            </th>
            <th scope="col" className="is-numeric">
              Comments
            </th>
            <th scope="col" className="is-numeric">
              Reposts
            </th>
            <th scope="col" className="is-numeric">
              Eng. Rate
            </th>
            <th scope="col">
              <span className="analytics-visually-hidden">Open on LinkedIn</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="content-analytics-table-post" title={row.post.text}>
                {row.title}
              </td>
              <td className="content-analytics-table-date">{formatShortDate(row.publishedAt)}</td>
              <td className="is-numeric">{metricCell(row.metrics.impressions)}</td>
              <td className="is-numeric">{metricCell(row.metrics.reactions)}</td>
              <td className="is-numeric">{metricCell(row.metrics.comments)}</td>
              <td className="is-numeric">{metricCell(row.metrics.reposts)}</td>
              <td className="is-numeric">{formatEngagementRate(row.engagementRate)}</td>
              <td className="content-analytics-table-action">
                <a
                  href={row.post.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open "${row.title}" on LinkedIn`}
                >
                  <HiOutlineArrowTopRightOnSquare />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
