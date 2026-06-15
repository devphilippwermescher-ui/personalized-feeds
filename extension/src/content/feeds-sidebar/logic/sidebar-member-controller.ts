import type { FeedInfo, FeedMemberInfo, MemberEditorState } from '../types';
import {
  fetchLinkedInRelationshipStatus,
  fetchStatusesProgressively,
  invalidateCacheForUser,
  resolveProfileUrn,
  sendLinkedInConnectRequest,
  sendLinkedInFollowState,
} from '../../linkedin-relationship-status';
import { openLinkedInMessage, openLinkedInProfile } from '../../linkedin-profile-actions';
import {
  animateExpandedFeedCollapse,
  stabilizeCollapsedFeedItem,
} from './feed-expansion-motion';
import {
  loadFeedMembers as loadFeedMembersLogic,
  renderMembersList as renderMembersListMarkup,
  toggleFeedExpansion as toggleFeedExpansionLogic,
} from './feed-members';
import {
  persistResolvedMemberState as persistResolvedMemberStateToStore,
  updateRenderedMemberState,
  type MemberActionDeps,
} from './member-actions';

interface SidebarMemberControllerDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  renderSidebarContent: () => void;
  loadFeeds: () => Promise<void>;
  getFeeds: () => FeedInfo[];
  getSidebarEl: () => HTMLElement | null;
  getMessagingButtonsEnabled: () => boolean;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  setFeedMembersById: (value: Record<string, FeedMemberInfo[]>) => void;
  getExpandedFeedId: () => string | null;
  setExpandedFeedId: (feedId: string | null) => void;
  getActiveMemberEditor: () => MemberEditorState | null;
  setActiveMemberEditor: (value: MemberEditorState | null) => void;
}

export function createSidebarMemberController(deps: SidebarMemberControllerDeps): {
  loadFeedMembers: (feedId: string) => Promise<void>;
  toggleFeedExpansion: (feedId: string) => Promise<void>;
  renderMembersList: (feed: FeedInfo) => string;
  getMemberActionDeps: () => MemberActionDeps;
  updateRenderedMemberState: (feedId: string, member: FeedMemberInfo) => boolean;
} {
  let statusFetchController: AbortController | null = null;
  let loadingMembersFeedId: string | null = null;
  let collapsingFeedId: string | null = null;
  let feedMembersRetryState: Record<string, boolean> = {};

  const persistResolvedMemberState = (
    feedId: string,
    member: FeedMemberInfo
  ): Promise<void> =>
    persistResolvedMemberStateToStore(feedId, member, {
      sendMsg: deps.sendMsg,
      getFeeds: deps.getFeeds,
    });

  const sharedFeedMemberDeps = () => ({
    sendMsg: deps.sendMsg,
    renderSidebarContent: deps.renderSidebarContent,
    fetchStatusesProgressively,
    persistResolvedMemberState,
    updateRenderedMemberState: updateRenderedMemberStateLocal,
    getStatusFetchController: () => statusFetchController,
    setStatusFetchController: (controller: AbortController | null) => {
      statusFetchController = controller;
    },
    getLoadingMembersFeedId: () => loadingMembersFeedId,
    setLoadingMembersFeedId: (feedId: string | null) => {
      loadingMembersFeedId = feedId;
    },
    getFeedMembersById: deps.getFeedMembersById,
    setFeedMembersById: deps.setFeedMembersById,
    getFeedMembersRetryState: () => feedMembersRetryState,
    setFeedMembersRetryState: (value: Record<string, boolean>) => {
      feedMembersRetryState = value;
    },
    getExpandedFeedId: deps.getExpandedFeedId,
    setExpandedFeedId: deps.setExpandedFeedId,
    setActiveMemberEditor: deps.setActiveMemberEditor,
    getFeeds: deps.getFeeds,
  });

  const loadFeedMembers = (feedId: string): Promise<void> =>
    loadFeedMembersLogic(feedId, sharedFeedMemberDeps());

  const getMemberActionDeps = (): MemberActionDeps => ({
    sendMsg: deps.sendMsg,
    showToast: deps.showToast,
    renderSidebarContent: deps.renderSidebarContent,
    openLinkedInMessage,
    openLinkedInProfile,
    fetchLinkedInRelationshipStatus,
    resolveProfileUrn,
    sendLinkedInConnectRequest,
    sendLinkedInFollowState,
    invalidateCacheForUser,
    getMessagingButtonsEnabled: deps.getMessagingButtonsEnabled,
    getFeedMembersById: deps.getFeedMembersById,
    setFeedMembersById: deps.setFeedMembersById,
    getFeeds: deps.getFeeds,
    loadFeeds: deps.loadFeeds,
    getActiveMemberEditor: deps.getActiveMemberEditor,
    setActiveMemberEditor: deps.setActiveMemberEditor,
    setExpandedFeedId: deps.setExpandedFeedId,
    loadFeedMembers,
  });

  function updateRenderedMemberStateLocal(
    feedId: string,
    member: FeedMemberInfo
  ): boolean {
    return updateRenderedMemberState(
      deps.getSidebarEl(),
      feedId,
      member,
      getMemberActionDeps()
    );
  }

  return {
    loadFeedMembers,
    getMemberActionDeps,
    updateRenderedMemberState: updateRenderedMemberStateLocal,
    renderMembersList: (feed) =>
      renderMembersListMarkup(feed, {
        getLoadingMembersFeedId: () => loadingMembersFeedId,
        getFeedMembersById: deps.getFeedMembersById,
        getMessagingButtonsEnabled: deps.getMessagingButtonsEnabled,
      }),
    toggleFeedExpansion: async (feedId) => {
      if (collapsingFeedId) {
        return;
      }

      const currentlyExpandedFeedId = deps.getExpandedFeedId();
      const sidebarEl = deps.getSidebarEl();
      if (currentlyExpandedFeedId && sidebarEl) {
        collapsingFeedId = currentlyExpandedFeedId;
        await animateExpandedFeedCollapse(sidebarEl, currentlyExpandedFeedId);
        collapsingFeedId = null;
      }

      await toggleFeedExpansionLogic(feedId, sharedFeedMemberDeps());

      if (currentlyExpandedFeedId && sidebarEl) {
        stabilizeCollapsedFeedItem(sidebarEl, currentlyExpandedFeedId);
      }
    },
  };
}
