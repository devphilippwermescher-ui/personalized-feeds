import type { FeedInfo, FeedMemberInfo, MemberEditorState, UserInfo } from '../types';
import type { UserFeatureSettings } from 'shared/types';
import { injectSharedStyles } from '../../../shared/ui';
import { FEEDS_SIDEBAR_CSS } from '../styles';
import { renderSidebarBody, renderSidebarHeader } from '../template';
import { bindSidebarDom } from './dom-bindings';
import {
  centerExpandedFeedInView,
  didExpandedFeedHeightChange,
  getExpandedFeedGroupHeight,
  shouldCenterExpandedFeed,
} from './feed-expansion-motion';
import {
  captureSidebarDomSnapshot,
  getLogoUrl,
  renderSidebarInnerMarkup,
  restoreSidebarDomSnapshot,
} from './sidebar-render';
import {
  ensureInit,
  toggleSidebar,
} from './sidebar-session';
import { getSharefeedTokenFromLocation } from './sharefeed-location';
import { onFeatureSettingsChange } from '../../feature-settings';
import type { FeedActionDeps } from './feed-actions';
import type { MemberActionDeps } from './member-actions';

interface SidebarUiControllerDeps {
  dashboardUrl: string;
  getCurrentUser: () => UserInfo | null;
  setCurrentUser: (user: UserInfo | null) => void;
  getFeatureSettings: () => UserFeatureSettings;
  setFeatureSettings: (settings: UserFeatureSettings) => void;
  getFeeds: () => FeedInfo[];
  getSharedFeeds: () => FeedInfo[];
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  getActiveFeedTab: () => 'owned' | 'shared';
  setActiveFeedTab: (tab: 'owned' | 'shared') => void;
  getExpandedFeedId: () => string | null;
  setExpandedFeedId: (feedId: string | null) => void;
  getActiveMemberEditor: () => MemberEditorState | null;
  setActiveMemberEditor: (state: MemberEditorState | null) => void;
  getIsLoading: () => boolean;
  getIsInitializing: () => boolean;
  setIsInitializing: (value: boolean) => void;
  getIsPremium: () => boolean;
  setIsPremium: (value: boolean) => void;
  getAuthErrorMessage: () => string;
  setAuthErrorMessage: (message: string) => void;
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  loadFeeds: () => Promise<void>;
  refreshSharedFeeds: () => Promise<void>;
  handleSignIn: () => Promise<void>;
  handleSignOut: () => Promise<void>;
  checkAuth: () => Promise<void>;
  schedulePendingShareRetries: () => void;
  renderFeedPreview: (feedId: string) => string;
  renderMembersList: (feed: FeedInfo) => string;
  getFeedActionDeps: () => FeedActionDeps;
  getMemberActionDeps: () => MemberActionDeps;
  showCreateFeedForm: () => void;
  toggleFeedExpansion: (feedId: string) => Promise<void>;
  openFeedPosts: (feedId: string) => Promise<void>;
  moveFeed: (sourceFeedId: string, targetFeedId: string) => Promise<void>;
  showEditFeedModal: (feed: FeedInfo) => void;
  showAddPeopleModal: (feed: FeedInfo) => void;
  showShareFeedModal: (feed: FeedInfo) => void;
  showDuplicateSharedFeedModal: (feed: FeedInfo) => void;
  unfollowSharedFeed: (feed: FeedInfo) => Promise<void>;
  deleteFeed: (feed: FeedInfo) => Promise<void>;
  handleMemberSave: () => Promise<void>;
  handleMemberDelete: (feedId: string, memberId: string) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export function createSidebarUiController(deps: SidebarUiControllerDeps): {
  start: () => void;
  renderSidebarContent: () => void;
  getSidebarEl: () => HTMLElement | null;
  isOpen: () => boolean;
} {
  let sidebarOpen = false;
  let sidebarEl: HTMLElement | null = null;
  let triggerBtn: HTMLElement | null = null;
  let lastRenderedExpandedFeedId: string | null = null;
  let sidebarSearchQuery = '';
  let feedListScrollTop = 0;
  let memberEditorScrollTop = 0;
  let draggedFeedId: string | null = null;
  let settingsMenuOpen = false;
  let accountMenuOpen = false;
  let sidebarBindingsFrameId: number | null = null;

  const filterFeeds = (query: string): void => {
    sidebarSearchQuery = query;
    const normalizedQuery = query.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('.lfa-feed-group').forEach((group) => {
      const name =
        group.querySelector('.lfa-feed-name')?.textContent?.toLowerCase() || '';
      group.style.display =
        !normalizedQuery || name.includes(normalizedQuery) ? '' : 'none';
    });
  };

  const renderSidebarInner = (container: HTMLElement): void => {
    const previousRenderedExpandedFeedId = lastRenderedExpandedFeedId;
    const nextRenderedExpandedFeedId = deps.getExpandedFeedId();
    const previousExpandedFeedHeight = getExpandedFeedGroupHeight(
      container,
      nextRenderedExpandedFeedId
    );
    const shouldCenterFeed = shouldCenterExpandedFeed(
      previousRenderedExpandedFeedId,
      nextRenderedExpandedFeedId
    );
    const snapshot = captureSidebarDomSnapshot(container, {
      feedListScrollTop,
      memberEditorScrollTop,
      searchQuery: sidebarSearchQuery,
    });

    renderSidebarInnerMarkup({
      container,
      currentUser: deps.getCurrentUser(),
      featureSettings: deps.getFeatureSettings(),
      feedsList: deps.getFeeds(),
      sharedFeedsList: deps.getSharedFeeds(),
      sidebarSearchQuery,
      activeFeedTab: deps.getActiveFeedTab(),
      expandedFeedId: deps.getExpandedFeedId(),
      activeMemberEditor: deps.getActiveMemberEditor(),
      renderSidebarHeader,
      renderSidebarBody,
      renderFeedPreview: deps.renderFeedPreview,
      renderMembersList: deps.renderMembersList,
      isLoading: deps.getIsLoading(),
      isInitializing: deps.getIsInitializing(),
      isPremium: deps.getIsPremium(),
      authErrorMessage: deps.getAuthErrorMessage(),
      getLogoUrl,
    });

    if (settingsMenuOpen) {
      container
        .querySelector('#lfa-settings-menu')
        ?.classList.add('lfa-settings-menu--open');
    }
    if (accountMenuOpen) {
      container
        .querySelector('#lfa-account-menu')
        ?.classList.add('lfa-account-menu--open');
    }

    restoreSidebarDomSnapshot(container, snapshot, (restoredSnapshot) => {
      feedListScrollTop = restoredSnapshot.feedListScrollTop;
      memberEditorScrollTop = restoredSnapshot.memberEditorScrollTop;
      sidebarSearchQuery = restoredSnapshot.searchQuery;
      const nextExpandedFeedHeight = getExpandedFeedGroupHeight(
        container,
        nextRenderedExpandedFeedId
      );

      if (
        nextRenderedExpandedFeedId &&
        (shouldCenterFeed ||
          didExpandedFeedHeightChange(
            previousExpandedFeedHeight,
            nextExpandedFeedHeight
          ))
      ) {
        centerExpandedFeedInView(container, nextRenderedExpandedFeedId);
      }
    });
    lastRenderedExpandedFeedId = nextRenderedExpandedFeedId;

    if (sidebarBindingsFrameId !== null) {
      cancelAnimationFrame(sidebarBindingsFrameId);
    }

    sidebarBindingsFrameId = requestAnimationFrame(() => {
      sidebarBindingsFrameId = null;
      bindSidebarDom(container, {
        toggleSidebar: toggle,
        handleSignIn: deps.handleSignIn,
        handleSignOut: deps.handleSignOut,
        showCreateFeedForm: deps.showCreateFeedForm,
        selectFeedTab: (tab) => {
          deps.setActiveFeedTab(tab);
          deps.setExpandedFeedId(null);
          deps.setActiveMemberEditor(null);
          sidebarSearchQuery = '';
          renderSidebarContent();

          if (tab === 'shared') {
            void deps.refreshSharedFeeds().then(() => {
              if (deps.getActiveFeedTab() === 'shared') {
                renderSidebarContent();
              }
            });
          }
        },
        openProfileSettings: () =>
          window.open(`${deps.dashboardUrl}/settings/profile`, '_blank'),
        openSubscription: () =>
          window.open(`${deps.dashboardUrl}/subscription`, '_blank'),
        updateFeatureSetting: async (key, value) => {
          const response = await deps.sendMsg({
            type: 'SETTINGS_UPDATE',
            updates: { [key]: value },
          });

          if (!response?.success) {
            deps.showToast(
              (response?.error as string) || 'Failed to update settings',
              'error'
            );
            renderSidebarContent();
            return;
          }

          deps.setFeatureSettings({
            ...deps.getFeatureSettings(),
            ...(response.settings as Partial<UserFeatureSettings>),
          });
          renderSidebarContent();
        },
        renderSidebarContent,
        handleMemberSave: deps.handleMemberSave,
        filterFeeds,
        toggleFeedExpansion: deps.toggleFeedExpansion,
        openFeedPosts: deps.openFeedPosts,
        moveFeed: deps.moveFeed,
        showEditFeedModal: deps.showEditFeedModal,
        showAddPeopleModal: deps.showAddPeopleModal,
        showShareFeedModal: deps.showShareFeedModal,
        showDuplicateSharedFeedModal: deps.showDuplicateSharedFeedModal,
        unfollowSharedFeed: deps.unfollowSharedFeed,
        deleteFeed: deps.deleteFeed,
        handleMemberDelete: deps.handleMemberDelete,
        openDashboard: () => window.open(deps.dashboardUrl, '_blank'),
        getFeeds: () =>
          deps.getActiveFeedTab() === 'owned'
            ? deps.getFeeds()
            : deps.getSharedFeeds(),
        getFeedMembersById: deps.getFeedMembersById,
        setActiveMemberEditor: deps.setActiveMemberEditor,
        getDraggedFeedId: () => draggedFeedId,
        setDraggedFeedId: (feedId) => {
          draggedFeedId = feedId;
        },
        setSettingsMenuOpen: (value) => {
          settingsMenuOpen = value;
        },
        setAccountMenuOpen: (value) => {
          accountMenuOpen = value;
        },
        memberActionDeps: deps.getMemberActionDeps(),
        togglePlan: () => {
          const newPlan = deps.getIsPremium() ? 'free' : 'premium';
          deps.setIsPremium(newPlan === 'premium');
          chrome.storage.local.set({ pf_userPlan: newPlan });
          renderSidebarContent();
        },
      });
    });
  };

  function renderSidebarContent(): void {
    if (sidebarEl) {
      renderSidebarInner(sidebarEl);
    }
  }

  function toggle(): void {
    settingsMenuOpen = false;
    accountMenuOpen = false;
    toggleSidebar({
      getSidebarOpen: () => sidebarOpen,
      setSidebarOpen: (value) => {
        sidebarOpen = value;
      },
      getSidebarEl: () => sidebarEl,
      getTriggerBtn: () => triggerBtn,
      setIsInitializing: deps.setIsInitializing,
      renderSidebarContent,
      setIsPremium: deps.setIsPremium,
      getIsPremium: deps.getIsPremium,
      getCurrentUser: deps.getCurrentUser,
      loadFeeds: deps.loadFeeds,
      sendMsg: deps.sendMsg,
      setCurrentUser: deps.setCurrentUser,
      setAuthErrorMessage: deps.setAuthErrorMessage,
    });
  }

  const init = (): void => {
    if (document.getElementById('lfa-sidebar')) {
      return;
    }

    if (!document.getElementById('lfa-sidebar-styles')) {
      injectSharedStyles();
      const style = document.createElement('style');
      style.id = 'lfa-sidebar-styles';
      style.textContent = FEEDS_SIDEBAR_CSS;
      document.head.appendChild(style);
    }

    onFeatureSettingsChange((settings) => {
      deps.setFeatureSettings(settings);
      if (sidebarOpen) {
        renderSidebarContent();
      }
    });

    const overlay = document.createElement('div');
    overlay.id = 'lfa-sidebar-overlay';
    overlay.className = 'lfa-sidebar-overlay';
    overlay.addEventListener('click', toggle);
    document.body.appendChild(overlay);

    triggerBtn = document.createElement('div');
    triggerBtn.className = 'lfa-trigger-btn';
    triggerBtn.id = 'lfa-feeds-trigger-btn';
    triggerBtn.setAttribute('data-extension', 'linkedin-analyzer-feeds');
    triggerBtn.title = 'myFeedPilot - Feeds';
    triggerBtn.innerHTML = `<img src="${getLogoUrl()}" alt="myFeedPilot" />`;
    triggerBtn.addEventListener('click', toggle);
    document.body.appendChild(triggerBtn);

    sidebarEl = document.createElement('div');
    sidebarEl.className = 'lfa-sidebar';
    sidebarEl.id = 'lfa-sidebar';
    renderSidebarInner(sidebarEl);
    document.body.appendChild(sidebarEl);
  };

  return {
    renderSidebarContent,
    getSidebarEl: () => sidebarEl,
    isOpen: () => sidebarOpen,
    start: () => {
      ensureInit({
        setIsPremium: deps.setIsPremium,
        init,
      });
      deps.schedulePendingShareRetries();

      if (getSharefeedTokenFromLocation()) {
        void deps.checkAuth();
      }

      setTimeout(() => {
        if (getSharefeedTokenFromLocation() && !sidebarOpen) {
          toggle();
        }
      }, 1500);

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.pf_userPlan) {
          deps.setIsPremium(changes.pf_userPlan.newValue === 'premium');
          if (sidebarOpen) {
            renderSidebarContent();
          }
        }
      });
    },
  };
}
