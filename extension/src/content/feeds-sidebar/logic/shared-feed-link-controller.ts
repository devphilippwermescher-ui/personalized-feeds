import type { FeedInfo, UserInfo } from '../types';
import { SESSION_EXPIRED_MESSAGE } from './sidebar-session';
import {
  getSharefeedTokenFromHref,
  getSharefeedTokenFromLocation,
  storePendingSharefeedToken,
  stripSharefeedFromLocation,
} from './sharefeed-location';
import { normalizeSharedFeed } from './profile-viewers-feed';
import type { SharingLimitDetails } from 'shared/types';

interface SharedFeedLinkControllerDeps {
  getCurrentUser: () => UserInfo | null;
  checkAuth: () => Promise<void>;
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getSharedFeeds: () => FeedInfo[];
  setSharedFeeds: (feeds: FeedInfo[]) => void;
  openSidebar: () => void;
  selectSharedTab: () => void;
  renderSidebarContent: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  showFollowedModal: (feed: FeedInfo) => void;
  showSignInRequired: () => void;
  showSharingLimit: (details: SharingLimitDetails) => void;
}

export function createSharedFeedLinkController(deps: SharedFeedLinkControllerDeps): {
  handlePendingSharedFeedLink: () => Promise<void>;
  schedulePendingShareRetries: () => void;
  stop: () => void;
} {
  let shareFollowInFlightToken: string | null = null;
  let retryIntervalId: number | null = null;
  let locationPollIntervalId: number | null = null;
  let locationWatcherStarted = false;
  let lastObservedDirectToken: string | null = null;
  let handledTerminalToken: string | null = null;
  let signInPromptedToken: string | null = null;

  const stopRetryWindow = (): void => {
    if (retryIntervalId !== null) {
      window.clearInterval(retryIntervalId);
      retryIntervalId = null;
    }
  };

  const handlePendingSharedFeedLink = async (): Promise<void> => {
    const token = getSharefeedTokenFromLocation();
    if (!token || shareFollowInFlightToken === token || handledTerminalToken === token) {
      return;
    }

    storePendingSharefeedToken(token);
    shareFollowInFlightToken = token;

    try {
      if (!deps.getCurrentUser()) {
        const shouldPromptForSignIn = signInPromptedToken !== token;
        if (shouldPromptForSignIn) {
          deps.openSidebar();
        }
        await deps.checkAuth();

        if (!deps.getCurrentUser()) {
          if (shouldPromptForSignIn) {
            signInPromptedToken = token;
            deps.showSignInRequired();
          }
          return;
        }
      }

      if (signInPromptedToken === token) {
        signInPromptedToken = null;
      }

      const response = await deps.sendMsg({ type: 'FEEDS_FOLLOW_SHARE_LINK', token });
      if (!response?.success || !response.sharedFeed) {
        const sharingLimit = response?.sharingLimit as SharingLimitDetails | undefined;
        if (sharingLimit) {
          handledTerminalToken = token;
          stopRetryWindow();
          stripSharefeedFromLocation();
          deps.showSharingLimit(sharingLimit);
          return;
        }
        const error = (response?.error as string) || '';
        const isRetryable = error === SESSION_EXPIRED_MESSAGE || error.toLowerCase().includes('permission denied');

        if (!isRetryable) {
          handledTerminalToken = token;
          stopRetryWindow();
          stripSharefeedFromLocation();
          deps.showToast(error || 'Failed to follow shared feed', 'error');
        }
        return;
      }

      const sharedFeed = normalizeSharedFeed(response.sharedFeed as FeedInfo & { role?: 'reader' | 'editor' });

      if (!deps.getSharedFeeds().some((feed) => feed.id === sharedFeed.id && feed.ownerId === sharedFeed.ownerId)) {
        deps.setSharedFeeds([sharedFeed, ...deps.getSharedFeeds()]);
      }

      deps.selectSharedTab();
      deps.renderSidebarContent();
      deps.showFollowedModal(sharedFeed);
      handledTerminalToken = token;
      stopRetryWindow();
      stripSharefeedFromLocation();
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
    const eventToken = event instanceof HashChangeEvent ? getSharefeedTokenFromHref(event.newURL) : null;

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
    document.addEventListener('visibilitychange', handleVisibilityChange);

    locationPollIntervalId = window.setInterval(() => {
      const directToken = getSharefeedTokenFromHref(window.location.href);
      if (!directToken) {
        lastObservedDirectToken = null;
        if (!getSharefeedTokenFromLocation()) {
          handledTerminalToken = null;
        }
        return;
      }
      if (directToken === lastObservedDirectToken) return;

      lastObservedDirectToken = directToken;
      storePendingSharefeedToken(directToken);
      void handlePendingSharedFeedLink();
      startRetryWindow();
    }, 250);
  };

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      handlePotentialSharefeedLocationChange();
    }
  }

  return {
    handlePendingSharedFeedLink,
    schedulePendingShareRetries: () => {
      startLocationWatcher();
      handlePotentialSharefeedLocationChange();
    },
    stop: () => {
      stopRetryWindow();
      if (locationPollIntervalId !== null) {
        window.clearInterval(locationPollIntervalId);
        locationPollIntervalId = null;
      }
      window.removeEventListener('hashchange', handlePotentialSharefeedLocationChange);
      window.removeEventListener('popstate', handlePotentialSharefeedLocationChange);
      window.removeEventListener('focus', handlePotentialSharefeedLocationChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      locationWatcherStarted = false;
      lastObservedDirectToken = null;
      handledTerminalToken = null;
      signInPromptedToken = null;
    },
  };
}
