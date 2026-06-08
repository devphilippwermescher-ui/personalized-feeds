import { useState } from 'react';
import { HiOutlinePlus } from 'react-icons/hi2';
import { useFeeds } from '../hooks/useFeeds';
import FeedCard from '../components/FeedCard';
import CreateFeedModal from '../components/CreateFeedModal';
import type { Feed } from 'shared/types';

interface DashboardPageProps {
  userId: string;
}

export default function DashboardPage({ userId }: DashboardPageProps) {
  const { feeds, loading, addFeed, editFeed, removeFeed } = useFeeds(userId);
  const [showCreate, setShowCreate] = useState(false);
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Feeds</h1>
          <p className="page-subtitle">Manage your personalized LinkedIn feeds</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <HiOutlinePlus />
          New Feed
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
        </div>
      ) : feeds.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            </svg>
          </div>
          <h2>No feeds yet</h2>
          <p>Create your first feed to start organizing LinkedIn profiles</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <HiOutlinePlus />
            Create Feed
          </button>
        </div>
      ) : (
        <div className="feeds-grid">
          {feeds.map((feed) => (
            <FeedCard
              key={feed.id}
              feed={feed}
              onDelete={removeFeed}
              onEdit={setEditingFeed}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateFeedModal
          onClose={() => setShowCreate(false)}
          onCreate={async (name, desc, color) => {
            await addFeed(name, desc, color);
          }}
        />
      )}

      {editingFeed && (
        <CreateFeedModal
          title="Edit Feed"
          submitLabel="Save Changes"
          initialValues={{
            name: editingFeed.name,
            description: editingFeed.description || '',
            color: editingFeed.color || '#615DEC',
          }}
          onClose={() => setEditingFeed(null)}
          onCreate={async (name, desc, color) => {
            await editFeed(editingFeed.id, { name, description: desc, color });
            setEditingFeed(null);
          }}
        />
      )}
    </div>
  );
}
