import type { ProfileViewerListItem, ProfileViewerSummary } from 'shared/types';
import type { ProfileViewersCollectionProgress } from '../../../shared/profile-viewers-progress';
import type { FeedInfo, FeedMemberInfo, UserInfo } from '../types';
import {
  buildProfileViewersState,
  PROFILE_VIEWERS_FEED_ID,
  withProfileViewersFeed,
} from '../logic/profile-viewers-feed';
import {
  parseProfileViewersCollectionProgress,
  registerProfileViewersRuntimeController,
} from './profile-viewers-runtime-controller';

interface SidebarProfileViewersControllerDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getCurrentUser: () => UserInfo | null;
  getFeeds: () => FeedInfo[];
  setFeeds: (feeds: FeedInfo[]) => void;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  setFeedMembersById: (members: Record<string, FeedMemberInfo[]>) => void;
  getExpandedFeedId: () => string | null;
  loadFeedMembers: (feedId: string) => Promise<void>;
  renderSidebarContent: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export function createSidebarProfileViewersController(deps: SidebarProfileViewersControllerDeps): {
  reset: () => void;
  updateFromResponse: (response: Record<string, unknown>) => boolean;
  ensureFeed: () => void;
  setRefreshConfirmation: (isConfirming: boolean) => void;
  refreshNow: () => Promise<void>;
} {
  let members: FeedMemberInfo[] = [];
  let privateCount: number | undefined;
  let collectionProgress: ProfileViewersCollectionProgress | undefined;
  let isRefreshing = false;

  const updateState = (
    viewers: ProfileViewerListItem[],
    summary?: ProfileViewerSummary | null,
    progress?: ProfileViewersCollectionProgress
  ): void => {
    collectionProgress = progress;
    const nextState = buildProfileViewersState({
      viewers,
      summary,
      feeds: deps.getFeeds(),
      feedMembersById: deps.getFeedMembersById(),
      currentUser: deps.getCurrentUser(),
      collectionProgress: progress,
    });
    members = nextState.members;
    privateCount = nextState.privateViewerCount;
    deps.setFeedMembersById(nextState.feedMembersById);
    deps.setFeeds(nextState.feeds);
  };

  const updateFromResponse = (response: Record<string, unknown>): boolean => {
    if (!Array.isArray(response.viewers)) return false;
    updateState(
      response.viewers as ProfileViewerListItem[],
      (response.summary as ProfileViewerSummary | null | undefined) || null,
      parseProfileViewersCollectionProgress(response.syncProgress)
    );
    return true;
  };

  const setRefreshing = (value: boolean): void => {
    isRefreshing = value;
    deps.setFeeds(
      deps.getFeeds().map((feed) =>
        feed.id === PROFILE_VIEWERS_FEED_ID
          ? {
              ...feed,
              isRefreshingProfileViewers: value,
              isConfirmingProfileViewersRefresh: value ? false : feed.isConfirmingProfileViewersRefresh,
            }
          : feed
      )
    );
    deps.renderSidebarContent();
  };

  const refreshAfterSync = async (): Promise<void> => {
    const response = await deps.sendMsg({ type: 'PROFILE_VIEWERS_GET' });
    if (!updateFromResponse(response)) return;
    deps.renderSidebarContent();
  };

  registerProfileViewersRuntimeController({
    setCollectionProgress: (progress) => {
      collectionProgress = progress;
      deps.setFeeds(
        deps
          .getFeeds()
          .map((feed) =>
            feed.id === PROFILE_VIEWERS_FEED_ID ? { ...feed, profileViewersCollectionProgress: progress } : feed
          )
      );
      deps.renderSidebarContent();
    },
    refreshAfterSync,
  });

  return {
    reset: () => {
      members = [];
      privateCount = undefined;
      collectionProgress = undefined;
      isRefreshing = false;
      const nextFeedMembersById = { ...deps.getFeedMembersById() };
      delete nextFeedMembersById[PROFILE_VIEWERS_FEED_ID];
      deps.setFeedMembersById(nextFeedMembersById);
    },
    updateFromResponse,
    ensureFeed: () => {
      deps.setFeeds(
        withProfileViewersFeed(
          deps.getFeeds(),
          members,
          privateCount,
          undefined,
          deps.getCurrentUser(),
          collectionProgress
        )
      );
    },
    setRefreshConfirmation: (isConfirming) => {
      if (isRefreshing) return;
      deps.setFeeds(
        deps
          .getFeeds()
          .map((feed) =>
            feed.id === PROFILE_VIEWERS_FEED_ID ? { ...feed, isConfirmingProfileViewersRefresh: isConfirming } : feed
          )
      );
      deps.renderSidebarContent();
    },
    refreshNow: async () => {
      if (isRefreshing) return;
      setRefreshing(true);
      try {
        const response = await deps.sendMsg({ type: 'PROFILE_VIEWERS_SYNC_API_NOW' });
        if (!response.success) {
          deps.showToast((response.error as string) || 'Failed to refresh profile visitors', 'error');
          return;
        }

        await refreshAfterSync();
        if (deps.getExpandedFeedId() === PROFILE_VIEWERS_FEED_ID) {
          await deps.loadFeedMembers(PROFILE_VIEWERS_FEED_ID);
        }
        const savedCount = typeof response.savedCount === 'number' ? response.savedCount : undefined;
        deps.showToast(
          savedCount !== undefined ? `Profile visitors refreshed (${savedCount} saved)` : 'Profile visitors refreshed',
          'success'
        );
      } catch (error) {
        console.warn('[LinkedIn Feeds] Failed to refresh profile visitors', error);
        deps.showToast('Failed to refresh profile visitors', 'error');
      } finally {
        setRefreshing(false);
      }
    },
  };
}
