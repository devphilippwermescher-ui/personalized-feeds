import type { FeedInfo, UserInfo } from '../types';
import { SESSION_EXPIRED_MESSAGE } from './sidebar-session';
import {
  getSharefeedTokenFromHref,
  getSharefeedTokenFromLocation,
  storePendingSharefeedToken,
  stripSharefeedFromLocation,
} from './sharefeed-location';
import { normalizeSharedFeed } from './profile-viewers-feed';

interface SharedFeedLinkControllerDeps {
  getCurrentUser: () => UserInfo | null;
  checkAuth: () => Promise<void>;
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
  let retryIntervalId: number | null = null;
  let locationWatcherStarted = false;

  const handlePendingSharedFeedLink = async (): Promise<void> => {
    if (!deps.getCurrentUser()) {
      await deps.checkAuth();

      if (!deps.getCurrentUser()) {
        return;
      }
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
      processedShareToken = null;
    } finally {
      if (shareFollowInFlightToken === token) {
        shareFollowInFlightToken = null;
      }
    }
  };

  const startRetryWindow = (): void => {
    if (retryIntervalId !== null) {
      window.clearInterval(retryIntervalId);
    }

    let attempt = 0;
    const maxAttempts = 40;
    retryIntervalId = window.setInterval(() => {
      attempt += 1;
      if (attempt > maxAttempts) {
        if (retryIntervalId !== null) {
          window.clearInterval(retryIntervalId);
          retryIntervalId = null;
        }
        return;
      }
      void handlePendingSharedFeedLink();
    }, 500);
  };

  const handlePotentialSharefeedLocationChange = (event?: Event): void => {
    const eventToken =
      event instanceof HashChangeEvent
        ? getSharefeedTokenFromHref(event.newURL)
        : null;

    if (eventToken) {
      storePendingSharefeedToken(eventToken);
    }

    if (!eventToken && !getSharefeedTokenFromLocation()) {
      return;
    }

    void handlePendingSharedFeedLink();
    startRetryWindow();
  };

  const startLocationWatcher = (): void => {
    if (locationWatcherStarted) {
      return;
    }

    locationWatcherStarted = true;
    window.addEventListener('hashchange', handlePotentialSharefeedLocationChange);
    window.addEventListener('popstate', handlePotentialSharefeedLocationChange);
    window.addEventListener('focus', handlePotentialSharefeedLocationChange);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handlePotentialSharefeedLocationChange();
      }
    });
  };

  return {
    handlePendingSharedFeedLink,
    schedulePendingShareRetries: () => {
      startLocationWatcher();
      startRetryWindow();
    },
  };
}
