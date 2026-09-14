import type { Root } from 'react-dom/client';
import type { AppPlan } from 'shared/plans';
import { fetchLinkedInRelationshipStatus, resolveProfileUrn } from '../../linkedin-relationship-status';
import { openPlanModal, type PlanModalContext } from '../../shared/plan-modal';
import { showToast } from '../../shared/toast';
import { attachFeedSyncListeners } from '../logic/external-member-sync';
import type { FeedActionDeps } from '../logic/feed-actions';
import { openFeedPosts } from '../logic/open-feed-posts';
import type { FeedInfo, FeedMemberInfo } from '../types';

interface SidebarFeedActionsControllerDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  renderSidebarContent: () => void;
  openSidebar: () => void;
  loadFeeds: () => Promise<void>;
  loadFeedMembers: (feedId: string) => Promise<void>;
  getFeeds: () => FeedInfo[];
  setFeeds: (feeds: FeedInfo[]) => void;
  getSharedFeeds: () => FeedInfo[];
  setSharedFeeds: (feeds: FeedInfo[]) => void;
  getActiveFeedTab: () => 'owned' | 'shared';
  getExpandedFeedId: () => string | null;
  setExpandedFeedId: (feedId: string | null) => void;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  setFeedMembersById: (membersById: Record<string, FeedMemberInfo[]>) => void;
  getCurrentPlan: () => AppPlan;
  updateRenderedMemberState: (feedId: string, member: FeedMemberInfo) => boolean;
}

export function createSidebarFeedActionsController(deps: SidebarFeedActionsControllerDeps): {
  getFeedActionDeps: () => FeedActionDeps;
  openFeedPosts: (feedId: string) => Promise<void>;
  attachFeedSyncListeners: () => void;
  closeModal: () => void;
} {
  let modalEl: HTMLElement | null = null;
  let modalRoot: Root | null = null;

  const getFeedActionDeps = (): FeedActionDeps => ({
    sendMsg: deps.sendMsg,
    showToast,
    renderSidebarContent: deps.renderSidebarContent,
    openSidebar: deps.openSidebar,
    loadFeeds: deps.loadFeeds,
    getFeeds: () => [...deps.getFeeds(), ...deps.getSharedFeeds()],
    setFeeds: deps.setFeeds,
    getSharedFeeds: deps.getSharedFeeds,
    setSharedFeeds: deps.setSharedFeeds,
    getActiveFeedTab: deps.getActiveFeedTab,
    getExpandedFeedId: deps.getExpandedFeedId,
    setExpandedFeedId: deps.setExpandedFeedId,
    getFeedMembersById: deps.getFeedMembersById,
    setFeedMembersById: deps.setFeedMembersById,
    getModalState: () => ({ el: modalEl, root: modalRoot }),
    setModalState: (state) => {
      modalEl = state.el;
      modalRoot = state.root;
    },
    showPlanModal: (context: PlanModalContext) => {
      openPlanModal({ plan: deps.getCurrentPlan(), context });
    },
  });

  return {
    getFeedActionDeps,
    closeModal: () => {
      modalRoot?.unmount();
      modalEl?.remove();
      modalRoot = null;
      modalEl = null;
    },
    openFeedPosts: (feedId) =>
      openFeedPosts(feedId, {
        getFeeds: () => [...deps.getFeeds(), ...deps.getSharedFeeds()],
        getFeedMembersById: deps.getFeedMembersById,
        loadFeedMembers: deps.loadFeedMembers,
        resolveProfileUrn,
        renderSidebarContent: deps.renderSidebarContent,
        showToast,
      }),
    attachFeedSyncListeners: () => {
      attachFeedSyncListeners({
        getFeeds: deps.getFeeds,
        setFeeds: deps.setFeeds,
        getSharedFeeds: deps.getSharedFeeds,
        setSharedFeeds: deps.setSharedFeeds,
        getFeedMembersById: deps.getFeedMembersById,
        setFeedMembersById: deps.setFeedMembersById,
        getExpandedFeedId: deps.getExpandedFeedId,
        loadFeeds: deps.loadFeeds,
        loadFeedMembers: deps.loadFeedMembers,
        renderSidebarContent: deps.renderSidebarContent,
        fetchLinkedInRelationshipStatus,
        updateRenderedMemberState: deps.updateRenderedMemberState,
      });
    },
  };
}
