import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HiOutlineArrowLeft, HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import { useFeedMembers } from '../hooks/useFeeds';
import { getFeed } from 'shared/firestore-service';
import type { Feed } from 'shared/types';
import MemberRow from '../components/MemberRow';

interface FeedDetailPageProps {
  userId: string;
}

export default function FeedDetailPage({ userId }: FeedDetailPageProps) {
  const { feedId } = useParams<{ feedId: string }>();
  const navigate = useNavigate();
  const { members, loading, removeMember } = useFeedMembers(userId, feedId || null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (feedId) {
      getFeed(userId, feedId).then(setFeed);
    }
  }, [userId, feedId]);

  const filteredMembers = members.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.displayName.toLowerCase().includes(q) ||
      m.linkedinUsername.toLowerCase().includes(q) ||
      (m.headline || '').toLowerCase().includes(q) ||
      (m.company || '').toLowerCase().includes(q)
    );
  });

  if (!feedId) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-back">
          <button className="back-btn" onClick={() => navigate('/')}>
            <HiOutlineArrowLeft />
          </button>
          <div>
            <div className="feed-detail-title">
              {feed && <span className="feed-dot-lg" style={{ background: feed.color || '#615DEC' }} />}
              <h1>{feed?.name || 'Loading...'}</h1>
            </div>
            {feed?.description && <p className="page-subtitle">{feed.description}</p>}
          </div>
        </div>
      </div>

      <div className="members-toolbar">
        <div className="search-box">
          <HiOutlineMagnifyingGlass />
          <input
            type="text"
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <span className="members-count">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
        </div>
      ) : members.length === 0 ? (
        <div className="empty-state">
          <h2>No members yet</h2>
          <p>
            Visit LinkedIn profiles and use the "Add to feed" button to add people to this feed.
          </p>
        </div>
      ) : (
        <div className="members-table-wrapper">
          <table className="members-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Headline</th>
                <th>Company</th>
                <th>Location</th>
                <th>Connection</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => (
                <MemberRow key={member.id} member={member} onRemove={removeMember} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
