import { HiOutlineMagnifyingGlass, HiOutlineSquares2X2, HiOutlineTableCells } from 'react-icons/hi2';
import type { ContentAnalyticsPostsView, ContentPostRow } from '../types';
import { ContentPostsCards } from './ContentPostsCards';
import { ContentPostsTable } from './ContentPostsTable';

interface ContentPostsSectionProps {
  rows: ContentPostRow[];
  totalCount: number;
  searchTerm: string;
  view: ContentAnalyticsPostsView;
  onSearchChange: (value: string) => void;
  onViewChange: (view: ContentAnalyticsPostsView) => void;
}

const VIEWS: Array<{ key: ContentAnalyticsPostsView; label: string; icon: React.ReactNode }> = [
  { key: 'table', label: 'Table', icon: <HiOutlineTableCells /> },
  { key: 'cards', label: 'Cards', icon: <HiOutlineSquares2X2 /> },
];

export function ContentPostsSection({
  rows,
  totalCount,
  searchTerm,
  view,
  onSearchChange,
  onViewChange,
}: ContentPostsSectionProps) {
  return (
    <section className="profile-analytics-card content-analytics-posts">
      <header className="content-analytics-posts-header">
        <h2>
          Posts <span>{`${rows.length} of ${totalCount}`}</span>
        </h2>
        <div className="content-analytics-posts-controls">
          <label className="content-analytics-search">
            <HiOutlineMagnifyingGlass aria-hidden />
            <span className="analytics-visually-hidden">Search posts</span>
            <input
              type="search"
              value={searchTerm}
              placeholder="Search posts..."
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
          <div className="content-analytics-view-toggle" role="group" aria-label="Posts layout">
            {VIEWS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={option.key === view}
                className={option.key === view ? 'is-active' : ''}
                onClick={() => onViewChange(option.key)}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="content-analytics-posts-empty">
          {totalCount === 0
            ? 'No posts were collected for this period yet.'
            : 'No posts match your search.'}
        </p>
      ) : view === 'table' ? (
        <ContentPostsTable rows={rows} />
      ) : (
        <ContentPostsCards rows={rows} />
      )}
    </section>
  );
}
