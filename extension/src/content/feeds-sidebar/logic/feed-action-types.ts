import type { Root } from 'react-dom/client';
import type { FeedInfo, FeedMemberInfo } from '../types';

export interface FeedActionDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  renderSidebarContent: () => void;
  loadFeeds: () => Promise<void>;
  getFeeds: () => FeedInfo[];
  setFeeds: (feeds: FeedInfo[]) => void;
  getSharedFeeds: () => FeedInfo[];
  setSharedFeeds: (feeds: FeedInfo[]) => void;
  getExpandedFeedId: () => string | null;
  setExpandedFeedId: (feedId: string | null) => void;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  setFeedMembersById: (membersById: Record<string, FeedMemberInfo[]>) => void;
  getModalState: () => { el: HTMLElement | null; root: Root | null };
  setModalState: (state: { el: HTMLElement | null; root: Root | null }) => void;
}
