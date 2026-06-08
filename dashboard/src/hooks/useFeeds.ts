import { useState, useEffect, useCallback } from 'react';
import type { Feed, FeedMember } from 'shared/types';
import {
  createFeed,
  getFeeds,
  updateFeed,
  deleteFeed,
  getFeedMembers,
  removeMemberFromFeed,
} from 'shared/firestore-service';

export function useFeeds(userId: string | null) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshFeeds = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await getFeeds(userId);
      setFeeds(result);
    } catch (error) {
      console.error('Failed to load feeds:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshFeeds();
  }, [refreshFeeds]);

  const addFeed = async (name: string, description?: string, color?: string) => {
    if (!userId) return null;
    const feed = await createFeed(userId, name, description, color);
    setFeeds((prev) => [feed, ...prev]);
    return feed;
  };

  const editFeed = async (feedId: string, updates: Partial<Pick<Feed, 'name' | 'description' | 'color'>>) => {
    if (!userId) return;
    await updateFeed(userId, feedId, updates);
    setFeeds((prev) =>
      prev.map((f) => (f.id === feedId ? { ...f, ...updates, updatedAt: Date.now() } : f))
    );
  };

  const removeFeed = async (feedId: string) => {
    if (!userId) return;
    await deleteFeed(userId, feedId);
    setFeeds((prev) => prev.filter((f) => f.id !== feedId));
  };

  return { feeds, loading, addFeed, editFeed, removeFeed, refreshFeeds };
}

export function useFeedMembers(userId: string | null, feedId: string | null) {
  const [members, setMembers] = useState<FeedMember[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshMembers = useCallback(async () => {
    if (!userId || !feedId) return;
    setLoading(true);
    try {
      const result = await getFeedMembers(userId, feedId);
      setMembers(result);
    } catch (error) {
      console.error('Failed to load members:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, feedId]);

  useEffect(() => {
    refreshMembers();
  }, [refreshMembers]);

  const removeMember = async (memberId: string) => {
    if (!userId || !feedId) return;
    await removeMemberFromFeed(userId, feedId, memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  return { members, loading, removeMember, refreshMembers };
}
