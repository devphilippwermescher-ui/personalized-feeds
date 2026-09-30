import { useNavigate } from 'react-router-dom';
import { HiOutlineTrash, HiOutlinePencil, HiOutlineUserGroup } from 'react-icons/hi2';
import type { Feed } from 'shared/types';

interface FeedCardProps {
  feed: Feed;
  onDelete: (feedId: string) => void;
  onEdit: (feed: Feed) => void;
}

export default function FeedCard({ feed, onDelete, onEdit }: FeedCardProps) {
  const navigate = useNavigate();

  return (
    <div className="feed-card" onClick={() => navigate(`/feed/${feed.id}`)}>
      <div className="feed-card-header">
        <div className="feed-card-dot" style={{ background: feed.color || '#615DEC' }} />
        <h3 className="feed-card-name">{feed.name}</h3>
      </div>
      {feed.description && <p className="feed-card-desc">{feed.description}</p>}
      <div className="feed-card-footer">
        <span className="feed-card-members">
          <HiOutlineUserGroup />
          {feed.memberCount} member{feed.memberCount !== 1 ? 's' : ''}
        </span>
        <div className="feed-card-actions">
          <button
            className="feed-card-action"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(feed);
            }}
            title="Edit feed"
          >
            <HiOutlinePencil />
          </button>
          <button
            className="feed-card-action delete"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${feed.name}" and all its members?`)) {
                onDelete(feed.id);
              }
            }}
            title="Delete feed"
          >
            <HiOutlineTrash />
          </button>
        </div>
      </div>
    </div>
  );
}
