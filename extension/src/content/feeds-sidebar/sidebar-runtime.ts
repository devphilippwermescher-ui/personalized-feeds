import type { FeedInfo, FeedMemberInfo, MemberEditorState, UserInfo } from './types';
import {
  createNewFeed,
  deleteFeedAction,
  moveFeed,
  showAddPeopleModal,
  showDuplicateSharedFeedModal,
  showEditFeedModal,
  showShareFeedModal,
  showShareNotificationModal,
  showSharingLimitModal,
  showSharedFeedFollowedModal,
  unfollowSharedFeed,
} from './logic/feed-actions';
import { handleMemberDelete, handleMemberSave } from './logic/member-actions';
import { renderFeedPreview as renderFeedPreviewMarkup } from './logic/feed-members';
import { showCreateFeedForm as showCreateFeedFormLogic } from './logic/create-feed-form';
import { DEFAULT_FEATURE_SETTINGS } from '../feature-settings';
import { showToast } from '../shared/toast';
import type { ShareNotification, UserFeatureSettings } from 'shared/types';
import { createSidebarAuthController } from './logic/sidebar-auth-controller';
import { createSharedFeedLinkController } from './logic/shared-feed-link-controller';
import { createSidebarMemberController } from './logic/sidebar-member-controller';
import { createSidebarUiController } from './logic/sidebar-ui-controller';
import { getDashboardOrigin } from 'shared/app-environment';
import { getPlanEntitlements, type AppPlan } from 'shared/plans';
import { openPlanModal } from '../shared/plan-modal';
import { findChangedSharedFeedRole } from './services/shared-feed-role-storage';
import { createSidebarFeedsController } from './controllers/sidebar-feeds-controller';
import { createSidebarFeedActionsController } from './controllers/sidebar-feed-actions-controller';
import { createSidebarProfileViewersController } from './controllers/sidebar-profile-viewers-controller';
import { registerPlanRuntimeController } from './controllers/plan-runtime-controller';
import { createShareNotificationController } from './controllers/share-notification-controller';
import { createBillingNoticeController } from './controllers/billing-notice-controller';

export function startFeedsSidebar(): void {
  const DASHBOARD_URL = getDashboardOrigin();

  let currentUser: UserInfo | null = null;
  let feedsList: FeedInfo[] = [];
  let sharedFeedsList: FeedInfo[] = [];
  let isLoading = false;
  let isInitializing = false;
  let currentPlan: AppPlan = 'free';
  let authErrorMessage = '';
  let featureSettings: UserFeatureSettings = DEFAULT_FEATURE_SETTINGS;
  let activeFeedTab: 'owned' | 'shared' = 'owned';
  let expandedFeedId: string | null = null;
  let feedMembersById: Record<string, FeedMemberInfo[]> = {};
  let activeMemberEditor: MemberEditorState | null = null;
  let sidebarUiController: ReturnType<typeof createSidebarUiController> | null = null;
  let feedsController: ReturnType<typeof createSidebarFeedsController> | null = null;
  let feedActionsController: ReturnType<typeof createSidebarFeedActionsController> | null = null;
  let profileViewersController: ReturnType<typeof createSidebarProfileViewersController> | null = null;
  let shareNotificationController: ReturnType<typeof createShareNotificationController> | null = null;

  async function syncSharedFeedRoleChanges(nextSharedFeeds: FeedInfo[]): Promise<void> {
    const changedFeed = await findChangedSharedFeedRole(currentUser?.userId, nextSharedFeeds);

    if (!changedFeed?.accessRole) {
      return;
    }

    showSharedFeedFollowedModal(changedFeed.name, changedFeed.ownerDisplayName || 'Unknown user', getFeedActionDeps(), {
      mode: 'roleChanged',
      role: changedFeed.accessRole,
    });
  }

  function renderSidebarContent(): void {
    sidebarUiController?.renderSidebarContent();
  }

  function loadFeeds(): Promise<void> {
    return feedsController?.loadFeeds() || Promise.resolve();
  }

  function refreshSharedFeeds(): Promise<void> {
    return feedsController?.refreshSharedFeeds() || Promise.resolve();
  }

  function resetSignedOutSidebarState(): void {
    sharedFeedsList = [];
    profileViewersController?.reset();
    activeFeedTab = 'owned';
  }

  async function loadCurrentPlan(force = false): Promise<void> {
    const response = await sendMsg({ type: 'PLAN_GET', force });
    currentPlan = response?.success === true && response.plan === 'pro' ? 'pro' : 'free';
  }

  async function refreshCurrentPlan(force = false): Promise<AppPlan> {
    await loadCurrentPlan(force);
    return currentPlan;
  }

  const { sendMsg, checkAuth, handleSignIn, handleEmailSignIn, handleEmailSignUp, handleSignOut } =
    createSidebarAuthController({
      closeModal: () => feedActionsController?.closeModal(),
      setCurrentUser: (user) => {
        currentUser = user;
      },
      setFeeds: (feeds) => {
        feedsList = feeds;
      },
      resetSignedOutState: resetSignedOutSidebarState,
      setExpandedFeedId: (feedId) => {
        expandedFeedId = feedId;
      },
      clearActiveMemberEditor: () => {
        activeMemberEditor = null;
      },
      setAuthErrorMessage: (message) => {
        authErrorMessage = message;
      },
      setIsLoading: (value) => {
        isLoading = value;
      },
      setIsInitializing: (value) => {
        isInitializing = value;
      },
      renderSidebarContent,
      loadFeeds,
      loadPlan: loadCurrentPlan,
      setIsPremium: (value) => {
        currentPlan = value ? 'pro' : 'free';
      },
    });

  const { handlePendingSharedFeedLink, schedulePendingShareRetries } = createSharedFeedLinkController({
    getCurrentUser: () => currentUser,
    checkAuth,
    sendMsg,
    getSharedFeeds: () => sharedFeedsList,
    setSharedFeeds: (feeds) => {
      sharedFeedsList = feeds;
    },
    selectSharedTab: () => {
      activeFeedTab = 'shared';
    },
    renderSidebarContent,
    showToast,
    showFollowedModal: (sharedFeed) => {
      showSharedFeedFollowedModal(sharedFeed.name, sharedFeed.ownerDisplayName || 'Unknown user', getFeedActionDeps());
    },
    showSharingLimit: (details) => {
      showSharingLimitModal(details, 'link', getFeedActionDeps());
    },
  });

  async function showPendingShareNotification(): Promise<void> {
    if (!currentUser) return;
    shareNotificationController?.start();
    const response = await sendMsg({ type: 'FEEDS_GET_SHARE_NOTIFICATIONS' });
    shareNotificationController?.handleLoadedNotifications(response?.notifications);
  }

  async function openFeedPosts(feedId: string): Promise<void> {
    await feedActionsController?.openFeedPosts(feedId);
  }

  function getFeedActionDeps() {
    if (!feedActionsController) {
      throw new Error('Sidebar feed actions controller is not initialized.');
    }
    return feedActionsController.getFeedActionDeps();
  }

  const {
    loadFeedMembers,
    toggleFeedExpansion,
    renderMembersList,
    getMemberActionDeps,
    updateRenderedMemberState: updateRenderedMemberStateLocal,
  } = createSidebarMemberController({
    sendMsg,
    showToast,
    showPlanModal: () => openPlanModal({ plan: currentPlan, context: 'members' }),
    renderSidebarContent,
    loadFeeds,
    getFeeds: () => [...feedsList, ...sharedFeedsList],
    getSidebarEl: () => sidebarUiController?.getSidebarEl() || null,
    getMessagingButtonsEnabled: () => featureSettings.messagingButtons,
    getFeedMembersById: () => feedMembersById,
    setFeedMembersById: (value) => {
      feedMembersById = value;
    },
    getExpandedFeedId: () => expandedFeedId,
    setExpandedFeedId: (feedId) => {
      expandedFeedId = feedId;
    },
    getActiveMemberEditor: () => activeMemberEditor,
    setActiveMemberEditor: (value) => {
      activeMemberEditor = value;
    },
  });

  feedActionsController = createSidebarFeedActionsController({
    sendMsg,
    renderSidebarContent,
    openSidebar: () => sidebarUiController?.openSidebar(),
    loadFeeds,
    loadFeedMembers,
    getFeeds: () => feedsList,
    setFeeds: (feeds) => {
      feedsList = feeds;
    },
    getSharedFeeds: () => sharedFeedsList,
    setSharedFeeds: (feeds) => {
      sharedFeedsList = feeds;
    },
    getActiveFeedTab: () => activeFeedTab,
    selectFeedTab: (tab) => {
      if (sidebarUiController) {
        sidebarUiController.selectFeedTab(tab);
        return;
      }
      activeFeedTab = tab;
      expandedFeedId = null;
      activeMemberEditor = null;
    },
    getExpandedFeedId: () => expandedFeedId,
    setExpandedFeedId: (feedId) => {
      expandedFeedId = feedId;
    },
    getFeedMembersById: () => feedMembersById,
    setFeedMembersById: (members) => {
      feedMembersById = members;
    },
    getCurrentPlan: () => currentPlan,
    updateRenderedMemberState: updateRenderedMemberStateLocal,
    onModalClosed: () => shareNotificationController?.handleModalClosed(),
  });

  shareNotificationController = createShareNotificationController({
    sendMsg,
    hasOpenModal: () => feedActionsController?.hasOpenModal() === true,
    showNotification: (notification: ShareNotification) => {
      if (notification.kind === 'incoming_share_added') {
        void refreshSharedFeeds()
          .then(renderSidebarContent)
          .catch((error) => {
            console.warn('[feed-sharing] Could not refresh newly shared feed', error);
          });
      }
      showShareNotificationModal(notification, getFeedActionDeps());
    },
  });

  profileViewersController = createSidebarProfileViewersController({
    sendMsg,
    getCurrentUser: () => currentUser,
    getFeeds: () => feedsList,
    setFeeds: (feeds) => {
      feedsList = feeds;
    },
    getFeedMembersById: () => feedMembersById,
    setFeedMembersById: (members) => {
      feedMembersById = members;
    },
    getExpandedFeedId: () => expandedFeedId,
    loadFeedMembers,
    renderSidebarContent,
    showToast,
  });

  feedsController = createSidebarFeedsController({
    sendMsg,
    getCurrentUser: () => currentUser,
    getFeeds: () => feedsList,
    setFeeds: (feeds) => {
      feedsList = feeds;
    },
    getSharedFeeds: () => sharedFeedsList,
    setSharedFeeds: (feeds) => {
      sharedFeedsList = feeds;
    },
    getFeedMembersById: () => feedMembersById,
    setFeedMembersById: (members) => {
      feedMembersById = members;
    },
    getExpandedFeedId: () => expandedFeedId,
    setFeatureSettings: (settings) => {
      featureSettings = settings;
    },
    updateProfileViewersFromResponse: profileViewersController.updateFromResponse,
    ensureProfileViewersFeed: profileViewersController.ensureFeed,
    loadFeedMembers,
    handlePendingSharedFeedLink,
    handlePendingShareNotification: showPendingShareNotification,
    handleSharedFeedRoleChanges: syncSharedFeedRoleChanges,
  });

  sidebarUiController = createSidebarUiController({
    dashboardUrl: DASHBOARD_URL,
    getCurrentUser: () => currentUser,
    setCurrentUser: (user) => {
      currentUser = user;
    },
    getFeatureSettings: () => featureSettings,
    setFeatureSettings: (settings) => {
      featureSettings = settings;
    },
    getFeeds: () => feedsList,
    getSharedFeeds: () => sharedFeedsList,
    getFeedMembersById: () => feedMembersById,
    getActiveFeedTab: () => activeFeedTab,
    setActiveFeedTab: (tab) => {
      activeFeedTab = tab;
    },
    getExpandedFeedId: () => expandedFeedId,
    setExpandedFeedId: (feedId) => {
      expandedFeedId = feedId;
    },
    getActiveMemberEditor: () => activeMemberEditor,
    setActiveMemberEditor: (state) => {
      activeMemberEditor = state;
    },
    getIsLoading: () => isLoading,
    getIsInitializing: () => isInitializing,
    setIsInitializing: (value) => {
      isInitializing = value;
    },
    getIsPremium: () => currentPlan === 'pro',
    getAuthErrorMessage: () => authErrorMessage,
    setAuthErrorMessage: (message) => {
      authErrorMessage = message;
    },
    sendMsg,
    loadFeeds,
    refreshSharedFeeds,
    handleSignIn,
    handleEmailSignIn,
    handleEmailSignUp,
    handleSignOut,
    checkAuth,
    loadPlan: loadCurrentPlan,
    schedulePendingShareRetries,
    renderFeedPreview: (feedId) => renderFeedPreviewMarkup(feedId, feedMembersById),
    renderMembersList,
    getFeedActionDeps,
    getMemberActionDeps,
    showCreateFeedForm: () => {
      const customFeeds = feedsList.filter((feed) => !feed.isSystem && !feed.isShared);
      const feedLimit = getPlanEntitlements(currentPlan).maxCustomFeeds;
      if (feedLimit !== null && customFeeds.length >= feedLimit) {
        openPlanModal({ plan: currentPlan, context: 'feeds' });
        return;
      }

      showCreateFeedFormLogic({
        createNewFeed: (name) => createNewFeed(name, getFeedActionDeps()),
        getFeeds: () => feedsList,
      });
    },
    toggleFeedExpansion,
    openFeedPosts,
    requestProfileViewersRefreshConfirmation: () => profileViewersController?.setRefreshConfirmation(true),
    cancelProfileViewersRefreshConfirmation: () => profileViewersController?.setRefreshConfirmation(false),
    refreshProfileViewers: () => profileViewersController?.refreshNow() || Promise.resolve(),
    moveFeed: (sourceFeedId, targetFeedId) => moveFeed(sourceFeedId, targetFeedId, getFeedActionDeps()),
    showEditFeedModal: (feed) => showEditFeedModal(feed, getFeedActionDeps()),
    showAddPeopleModal: (feed) => showAddPeopleModal(feed, getFeedActionDeps()),
    showShareFeedModal: (feed) => showShareFeedModal(feed, getFeedActionDeps()),
    showDuplicateSharedFeedModal: (feed) => showDuplicateSharedFeedModal(feed, getFeedActionDeps()),
    unfollowSharedFeed: (feed) => unfollowSharedFeed(feed, getFeedActionDeps()),
    deleteFeed: (feed) => deleteFeedAction(feed, getFeedActionDeps()),
    handleMemberSave: () => handleMemberSave(getMemberActionDeps()),
    handleMemberDelete: (feedId, memberId) => handleMemberDelete(feedId, memberId, getMemberActionDeps()),
    showToast,
  });

  const billingNoticeController = createBillingNoticeController({
    sendMsg,
    isSidebarOpen: () => sidebarUiController?.isOpen() === true,
    showError: (message) => showToast(message, 'error'),
  });

  feedActionsController.attachFeedSyncListeners();
  registerPlanRuntimeController({
    getPlan: () => currentPlan,
    refreshPlan: () => refreshCurrentPlan(true),
    setPlan: (plan) => {
      currentPlan = plan;
    },
    renderSidebar: renderSidebarContent,
    activateProFeatures: async () => {
      const [feedsResult, syncResult] = await Promise.allSettled([
        loadFeeds(),
        sendMsg({ type: 'PROFILE_VIEWERS_SYNC_API_NOW', resetProfileViewers: true }),
      ]);

      if (feedsResult.status === 'rejected') {
        console.warn('[plan] Failed to reload sidebar data after Pro activation', feedsResult.reason);
      }
      if (syncResult.status === 'rejected' || syncResult.value?.success !== true) {
        console.warn(
          '[plan] Failed to start the Pro Profile Visitors collection',
          syncResult.status === 'rejected' ? syncResult.reason : syncResult.value?.error
        );
      }

      renderSidebarContent();
    },
    deactivateProFeatures: async () => {
      try {
        await loadFeeds();
      } catch (error) {
        console.warn('[plan] Failed to reload sidebar data after Pro expiration', error);
      }
      renderSidebarContent();
    },
  });
  sidebarUiController.start();
  billingNoticeController.start();
  shareNotificationController.start();
}
