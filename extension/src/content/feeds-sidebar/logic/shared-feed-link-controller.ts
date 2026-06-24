import type { FeedInfo, UserInfo } from '../types';
import { SESSION_EXPIRED_MESSAGE } from './sidebar-session';
import {
  getSharefeedTokenFromLocation,
  stripSharefeedFromLocation,
} from './sharefeed-location';
import { normalizeSharedFeed } from './profile-viewers-feed';

interface SharedFeedLinkControllerDeps {
  getCurrentUser: () => UserInfo | null;
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getSharedFeeds: () => FeedInfo[];
  setSharedFeeds: (feeds: FeedInfo[]) => void;
  selectSharedTab: () => void;
  renderSidebarContent: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  showFollowedModal: (feed: FeedInfo) => void;
}

export function createSharedFeedLinkController(
  deps: SharedFeedLinkControllerDeps
): {
  handlePendingSharedFeedLink: () => Promise<void>;
  schedulePendingShareRetries: () => void;
} {
  let processedShareToken: string | null = null;
  let shareFollowInFlightToken: string | null = null;

  const handlePendingSharedFeedLink = async (): Promise<void> => {
    if (!deps.getCurrentUser()) {
      return;
    }

    const token = getSharefeedTokenFromLocation();
    if (!token || processedShareToken === token || shareFollowInFlightToken === token) {
      return;
    }

    shareFollowInFlightToken = token;

    try {
      const response = await deps.sendMsg({ type: 'FEEDS_FOLLOW_SHARE_LINK', token });
      if (!response?.success || !response.sharedFeed) {
        const error = (response?.error as string) || '';
        const isRetryable =
          error === SESSION_EXPIRED_MESSAGE ||
          error.toLowerCase().includes('permission denied');

        if (!isRetryable) {
          processedShareToken = token;
          deps.showToast(error || 'Failed to follow shared feed', 'error');
        }
        return;
      }

      processedShareToken = token;
      const sharedFeed = normalizeSharedFeed(
        response.sharedFeed as FeedInfo & { role?: 'reader' | 'editor' }
      );

      if (
        !deps
          .getSharedFeeds()
          .some(
            (feed) =>
              feed.id === sharedFeed.id && feed.ownerId === sharedFeed.ownerId
          )
      ) {
        deps.setSharedFeeds([sharedFeed, ...deps.getSharedFeeds()]);
      }

      deps.selectSharedTab();
      deps.renderSidebarContent();
      deps.showFollowedModal(sharedFeed);
      stripSharefeedFromLocation();
    } finally {
      if (shareFollowInFlightToken === token) {
        shareFollowInFlightToken = null;
      }
    }
  };

  return {
    handlePendingSharedFeedLink,
    schedulePendingShareRetries: () => {
      let attempt = 0;
      const maxAttempts = 40;
      const intervalId = window.setInterval(() => {
        attempt += 1;
        if (attempt > maxAttempts) {
          window.clearInterval(intervalId);
          return;
        }
        void handlePendingSharedFeedLink();
      }, 500);
    },
  };
}
