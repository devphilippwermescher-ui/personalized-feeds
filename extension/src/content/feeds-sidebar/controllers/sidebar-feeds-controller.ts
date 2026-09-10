import type { UserFeatureSettings } from 'shared/types';
import { loadFeatureSettings } from '../../feature-settings';
import { getStaleFeedMemberCacheIds } from '../logic/feed-members';
import { normalizeSharedFeed } from '../logic/profile-viewers-feed';
import type { FeedInfo, FeedMemberInfo, UserInfo } from '../types';

type SharedFeedResponse = FeedInfo & {
  role?: 'reader' | 'editor';
  previousRole?: 'reader' | 'editor';
};

interface SidebarFeedsControllerDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getCurrentUser: () => UserInfo | null;
  getFeeds: () => FeedInfo[];
  setFeeds: (feeds: FeedInfo[]) => void;
  getSharedFeeds: () => FeedInfo[];
  setSharedFeeds: (feeds: FeedInfo[]) => void;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  setFeedMembersById: (members: Record<string, FeedMemberInfo[]>) => void;
  getExpandedFeedId: () => string | null;
  setFeatureSettings: (settings: UserFeatureSettings) => void;
  updateProfileViewersFromResponse: (response: Record<string, unknown>) => boolean;
  ensureProfileViewersFeed: () => void;
  loadFeedMembers: (feedId: string) => Promise<void>;
  handlePendingSharedFeedLink: () => Promise<void>;
  handleSharedFeedRoleChanges: (feeds: FeedInfo[]) => Promise<void>;
}

export function createSidebarFeedsController(deps: SidebarFeedsControllerDeps): {
  loadFeeds: () => Promise<void>;
  refreshSharedFeeds: () => Promise<void>;
} {
  const setNormalizedSharedFeeds = async (response: Record<string, unknown>): Promise<boolean> => {
    if (!Array.isArray(response.sharedFeeds)) return false;
    const feeds = (response.sharedFeeds as SharedFeedResponse[]).map(normalizeSharedFeed);
    deps.setSharedFeeds(feeds);
    await deps.handleSharedFeedRoleChanges(feeds);
    return true;
  };

  return {
    refreshSharedFeeds: async () => {
      await setNormalizedSharedFeeds(await deps.sendMsg({ type: 'FEEDS_GET_SHARED_ALL' }));
    },
    loadFeeds: async () => {
      const [ownedResponse, sharedResponse, profileViewersResponse, settings] = await Promise.all([
        deps.sendMsg({ type: 'FEEDS_GET_ALL' }),
        deps.sendMsg({ type: 'FEEDS_GET_SHARED_ALL' }),
        deps.sendMsg({ type: 'PROFILE_VIEWERS_GET' }),
        loadFeatureSettings(),
      ]);

      deps.setFeatureSettings(settings);
      if (Array.isArray(ownedResponse.feeds)) {
        deps.setFeeds(
          (ownedResponse.feeds as FeedInfo[]).map((feed) => ({
            ...feed,
            ownerId: deps.getCurrentUser()?.userId,
            isShared: false,
          }))
        );
      }

      if (!deps.updateProfileViewersFromResponse(profileViewersResponse)) {
        deps.ensureProfileViewersFeed();
      }
      await setNormalizedSharedFeeds(sharedResponse);

      const staleFeedIds = getStaleFeedMemberCacheIds(
        [...deps.getFeeds(), ...deps.getSharedFeeds()],
        deps.getFeedMembersById()
      );
      if (staleFeedIds.length > 0) {
        const nextFeedMembersById = { ...deps.getFeedMembersById() };
        staleFeedIds.forEach((feedId) => {
          delete nextFeedMembersById[feedId];
        });
        deps.setFeedMembersById(nextFeedMembersById);

        const expandedFeedId = deps.getExpandedFeedId();
        if (expandedFeedId && staleFeedIds.includes(expandedFeedId)) {
          await deps.loadFeedMembers(expandedFeedId);
        }
      }

      await deps.handlePendingSharedFeedLink();
    },
  };
}
