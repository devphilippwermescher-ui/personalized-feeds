import type {
  FeedInfo,
  FeedMemberInfo,
  MemberEditorState,
  UserInfo,
} from './types';
import {
  fetchLinkedInRelationshipStatus,
  resolveProfileUrn,
} from '../linkedin-relationship-status';
import {
  createNewFeed,
  deleteFeedAction,
  moveFeed,
  showAddPeopleModal,
  showDuplicateSharedFeedModal,
  showEditFeedModal,
  showShareFeedModal,
  showSharedFeedFollowedModal,
  unfollowSharedFeed,
} from './logic/feed-actions';
import {
  handleMemberDelete,
  handleMemberSave,
} from './logic/member-actions';
import {
  getStaleFeedMemberCacheIds,
  renderFeedPreview as renderFeedPreviewMarkup,
} from './logic/feed-members';
import { showCreateFeedForm as showCreateFeedFormLogic } from './logic/create-feed-form';
import { DEFAULT_FEATURE_SETTINGS, loadFeatureSettings } from '../feature-settings';
import { showToast } from '../shared/toast';
import type {
  ProfileViewerListItem,
  ProfileViewerSummary,
  UserFeatureSettings,
} from 'shared/types';
import type { Root } from 'react-dom/client';
import {
  buildProfileViewersState,
  normalizeSharedFeed,
  PROFILE_VIEWERS_FEED_ID,
  withProfileViewersFeed,
} from './logic/profile-viewers-feed';
import { openFeedPosts as openFeedPostsLogic } from './logic/open-feed-posts';
import { attachFeedSyncListeners as attachFeedSyncListenersLogic } from './logic/external-member-sync';
import { createSidebarAuthController } from './logic/sidebar-auth-controller';
import { createSharedFeedLinkController } from './logic/shared-feed-link-controller';
import { createSidebarMemberController } from './logic/sidebar-member-controller';
import { createSidebarUiController } from './logic/sidebar-ui-controller';

const DASHBOARD_URL = 'https://linkedin-feed-sorter.web.app';
const PROFILE_VIEWER_STATUS_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const PROFILE_VIEWER_STATUS_SWEEP_LAST_STARTED_AT_KEY =
  'lfs_profile_viewer_status_sweep_last_started_at';

let currentUser: UserInfo | null = null;
let feedsList: FeedInfo[] = [];
let sharedFeedsList: FeedInfo[] = [];
let profileViewerMembers: FeedMemberInfo[] = [];
let profileViewerPrivateCount: number | undefined;
let isRefreshingProfileViewers = false;
let isConfirmingProfileViewersRefresh = false;
let isLoading = false;
let isInitializing = false;
let isPremium = false;
let authErrorMessage = '';
let featureSettings: UserFeatureSettings = DEFAULT_FEATURE_SETTINGS;
let activeFeedTab: 'owned' | 'shared' = 'owned';
let expandedFeedId: string | null = null;
let feedMembersById: Record<string, FeedMemberInfo[]> = {};
let activeMemberEditor: MemberEditorState | null = null;
let feedActionModalEl: HTMLElement | null = null;
let feedActionModalRoot: Root | null = null;
let sidebarUiController: ReturnType<typeof createSidebarUiController> | null = null;
let profileViewerStatusSweepTimer: ReturnType<typeof setTimeout> | null = null;

function renderSidebarContent(): void {
  sidebarUiController?.renderSidebarContent();
}

function setProfileViewersRefreshing(isRefreshing: boolean): void {
  isRefreshingProfileViewers = isRefreshing;
  if (isRefreshing) {
    isConfirmingProfileViewersRefresh = false;
  }
  feedsList = feedsList.map((feed) =>
    feed.id === PROFILE_VIEWERS_FEED_ID
      ? {
          ...feed,
          isRefreshingProfileViewers: isRefreshing,
          isConfirmingProfileViewersRefresh: isRefreshing
            ? false
            : feed.isConfirmingProfileViewersRefresh,
        }
      : feed
  );
  renderSidebarContent();
}

function setProfileViewersRefreshConfirmation(isConfirming: boolean): void {
  if (isRefreshingProfileViewers) {
    return;
  }

  isConfirmingProfileViewersRefresh = isConfirming;
  feedsList = feedsList.map((feed) =>
    feed.id === PROFILE_VIEWERS_FEED_ID
      ? { ...feed, isConfirmingProfileViewersRefresh: isConfirming }
      : feed
  );
  renderSidebarContent();
}

function resetSignedOutSidebarState(): void {
  clearProfileViewerStatusSweepTimer();
  sharedFeedsList = [];
  profileViewerMembers = [];
  profileViewerPrivateCount = undefined;
  isRefreshingProfileViewers = false;
  isConfirmingProfileViewersRefresh = false;
  const nextFeedMembersById = { ...feedMembersById };
  delete nextFeedMembersById[PROFILE_VIEWERS_FEED_ID];
  feedMembersById = nextFeedMembersById;
  activeFeedTab = 'owned';
}

function clearProfileViewerStatusSweepTimer(): void {
  if (profileViewerStatusSweepTimer) {
    clearTimeout(profileViewerStatusSweepTimer);
    profileViewerStatusSweepTimer = null;
  }
}

function getStoredProfileViewerStatusSweepLastStartedAt(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      PROFILE_VIEWER_STATUS_SWEEP_LAST_STARTED_AT_KEY,
      (stored) => {
        const value = stored[PROFILE_VIEWER_STATUS_SWEEP_LAST_STARTED_AT_KEY];
        resolve(typeof value === 'number' ? value : 0);
      }
    );
  });
}

function setStoredProfileViewerStatusSweepLastStartedAt(value: number): Promise<void> {
  return chrome.storage.local.set({
    [PROFILE_VIEWER_STATUS_SWEEP_LAST_STARTED_AT_KEY]: value,
  });
}

function hasProfileViewerProfilesForStatusSweep(): boolean {
  const members = feedMembersById[PROFILE_VIEWERS_FEED_ID] || profileViewerMembers;
  return members.some((member) => !member.itemType || member.itemType === 'profile');
}

async function scheduleProfileViewerStatusSweep(): Promise<void> {
  clearProfileViewerStatusSweepTimer();

  if (!currentUser || !hasProfileViewerProfilesForStatusSweep()) {
    return;
  }

  const now = Date.now();
  const lastStartedAt = await getStoredProfileViewerStatusSweepLastStartedAt();
  if (!lastStartedAt) {
    await setStoredProfileViewerStatusSweepLastStartedAt(now);
    profileViewerStatusSweepTimer = setTimeout(() => {
      void runProfileViewerStatusSweep();
    }, PROFILE_VIEWER_STATUS_SWEEP_INTERVAL_MS);
    return;
  }

  const delayMs = Math.max(
    0,
    lastStartedAt + PROFILE_VIEWER_STATUS_SWEEP_INTERVAL_MS - now
  );
  profileViewerStatusSweepTimer = setTimeout(() => {
    void runProfileViewerStatusSweep();
  }, delayMs);
}

async function runProfileViewerStatusSweep(): Promise<void> {
  profileViewerStatusSweepTimer = null;

  try {
    if (currentUser && hasProfileViewerProfilesForStatusSweep()) {
      await setStoredProfileViewerStatusSweepLastStartedAt(Date.now());
      startProfileViewerStatusRefreshCycle(PROFILE_VIEWERS_FEED_ID);
    }
  } finally {
    void scheduleProfileViewerStatusSweep();
  }
}

const { sendMsg, checkAuth, handleSignIn, handleSignOut } =
  createSidebarAuthController({
    closeModal: () => {
      feedActionModalRoot?.unmount();
      feedActionModalEl?.remove();
      feedActionModalRoot = null;
      feedActionModalEl = null;
    },
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
  });

const { handlePendingSharedFeedLink, schedulePendingShareRetries } =
  createSharedFeedLinkController({
    getCurrentUser: () => currentUser,
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
      showSharedFeedFollowedModal(
        sharedFeed.name,
        sharedFeed.ownerDisplayName || 'Unknown user',
        getFeedActionDeps()
      );
    },
  });

function updateProfileViewersState(
  viewers: ProfileViewerListItem[],
  summary?: ProfileViewerSummary | null
): void {
  const nextState = buildProfileViewersState({
    viewers,
    summary,
    feeds: feedsList,
    feedMembersById,
    currentUser,
  });
  profileViewerMembers = nextState.members;
  profileViewerPrivateCount = nextState.privateViewerCount;
  feedMembersById = nextState.feedMembersById;
  feedsList = nextState.feeds;
}

async function refreshProfileViewersAfterBackgroundSync(): Promise<void> {
  const response = await sendMsg({ type: 'PROFILE_VIEWERS_GET' });
  if (!Array.isArray(response?.viewers)) {
    return;
  }

  updateProfileViewersState(
    response.viewers as ProfileViewerListItem[],
    (response.summary as ProfileViewerSummary | null | undefined) || null
  );
  void scheduleProfileViewerStatusSweep();
  renderSidebarContent();
}

async function refreshProfileViewersNow(): Promise<void> {
  if (isRefreshingProfileViewers) {
    return;
  }

  setProfileViewersRefreshing(true);
  try {
    const response = await sendMsg({
      type: 'PROFILE_VIEWERS_SYNC_API_NOW',
      resetProfileViewers: true,
    });
    if (!response?.success) {
      showToast(
        (response?.error as string) || 'Failed to refresh profile visitors',
        'error'
      );
      return;
    }

    await refreshProfileViewersAfterBackgroundSync();
    if (expandedFeedId === PROFILE_VIEWERS_FEED_ID) {
      await loadFeedMembers(PROFILE_VIEWERS_FEED_ID);
    }

    const savedCount =
      typeof response.savedCount === 'number' ? response.savedCount : undefined;
    showToast(
      savedCount !== undefined
        ? `Profile visitors refreshed (${savedCount} saved)`
        : 'Profile visitors refreshed',
      'success'
    );
  } catch (error) {
    console.warn('[LinkedIn Feeds] Failed to refresh profile visitors', error);
    showToast('Failed to refresh profile visitors', 'error');
  } finally {
    setProfileViewersRefreshing(false);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PROFILE_VIEWERS_SYNC_COMPLETED') {
    void refreshProfileViewersAfterBackgroundSync();
  }
});

async function refreshSharedFeeds(): Promise<void> {
  const sharedResp = await sendMsg({ type: 'FEEDS_GET_SHARED_ALL' });

  if (!Array.isArray(sharedResp?.sharedFeeds)) {
    return;
  }

  sharedFeedsList = (sharedResp.sharedFeeds as Array<FeedInfo & { role?: 'reader' | 'editor' }>).map(normalizeSharedFeed);
}

async function openFeedPosts(feedId: string): Promise<void> {
  await openFeedPostsLogic(feedId, {
    getFeeds: () => [...feedsList, ...sharedFeedsList],
    getFeedMembersById: () => feedMembersById,
    loadFeedMembers,
    resolveProfileUrn,
    renderSidebarContent,
    showToast,
  });
}

function getFeedActionDeps() {
  return {
    sendMsg,
    showToast,
    renderSidebarContent,
    loadFeeds,
    getFeeds: () => [...feedsList, ...sharedFeedsList],
    setFeeds: (feeds: FeedInfo[]) => {
      feedsList = feeds;
    },
    getSharedFeeds: () => sharedFeedsList,
    setSharedFeeds: (feeds: FeedInfo[]) => {
      sharedFeedsList = feeds;
    },
    getExpandedFeedId: () => expandedFeedId,
    setExpandedFeedId: (feedId: string | null) => {
      expandedFeedId = feedId;
    },
    getFeedMembersById: () => feedMembersById,
    setFeedMembersById: (membersById: Record<string, FeedMemberInfo[]>) => {
      feedMembersById = membersById;
    },
    getModalState: () => ({
      el: feedActionModalEl,
      root: feedActionModalRoot,
    }),
    setModalState: (state: { el: HTMLElement | null; root: Root | null }) => {
      feedActionModalEl = state.el;
      feedActionModalRoot = state.root;
    },
  };
}

function attachFeedSyncListeners(): void {
  attachFeedSyncListenersLogic({
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
    loadFeeds,
    loadFeedMembers,
    renderSidebarContent,
    fetchLinkedInRelationshipStatus,
    updateRenderedMemberState: updateRenderedMemberStateLocal,
  });
}

// ── Messaging ──

async function loadFeeds(): Promise<void> {
  const [ownedResp, sharedResp, profileViewersResp, settings] = await Promise.all([
    sendMsg({ type: 'FEEDS_GET_ALL' }),
    sendMsg({ type: 'FEEDS_GET_SHARED_ALL' }),
    sendMsg({ type: 'PROFILE_VIEWERS_GET' }),
    loadFeatureSettings(),
  ]);

  featureSettings = settings;

  if (Array.isArray(ownedResp?.feeds)) {
    feedsList = (ownedResp.feeds as FeedInfo[]).map((feed) => ({
      ...feed,
      ownerId: currentUser?.userId,
      isShared: false,
    }));
  }

  if (Array.isArray(profileViewersResp?.viewers)) {
    updateProfileViewersState(
      profileViewersResp.viewers as ProfileViewerListItem[],
      (profileViewersResp.summary as ProfileViewerSummary | null | undefined) || null
    );
    void scheduleProfileViewerStatusSweep();
  } else {
    feedsList = withProfileViewersFeed(
      feedsList,
      profileViewerMembers,
      profileViewerPrivateCount,
      undefined,
      currentUser
    );
  }

  if (Array.isArray(sharedResp?.sharedFeeds)) {
    sharedFeedsList = (sharedResp.sharedFeeds as Array<FeedInfo & { role?: 'reader' | 'editor' }>).map(normalizeSharedFeed);
  }

  const staleFeedIds = getStaleFeedMemberCacheIds(
    [...feedsList, ...sharedFeedsList],
    feedMembersById
  );
  if (staleFeedIds.length > 0) {
    const nextFeedMembersById = { ...feedMembersById };
    staleFeedIds.forEach((feedId) => {
      delete nextFeedMembersById[feedId];
    });
    feedMembersById = nextFeedMembersById;

    if (expandedFeedId && staleFeedIds.includes(expandedFeedId)) {
      await loadFeedMembers(expandedFeedId);
    }
  }

  await handlePendingSharedFeedLink();
}

const {
  loadFeedMembers,
  toggleFeedExpansion,
  renderMembersList,
  getMemberActionDeps,
  updateRenderedMemberState: updateRenderedMemberStateLocal,
  startProfileViewerStatusRefreshCycle,
} = createSidebarMemberController({
  sendMsg,
  showToast,
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

// renderEditorField replaced by shared/ui components (renderLfsInput, renderLfsDropdown)

// ── CSS ──

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
  getIsPremium: () => isPremium,
  setIsPremium: (value) => {
    isPremium = value;
  },
  getAuthErrorMessage: () => authErrorMessage,
  setAuthErrorMessage: (message) => {
    authErrorMessage = message;
  },
  sendMsg,
  loadFeeds,
  refreshSharedFeeds,
  handleSignIn,
  handleSignOut,
  checkAuth,
  schedulePendingShareRetries,
  renderFeedPreview: (feedId) =>
    renderFeedPreviewMarkup(feedId, feedMembersById),
  renderMembersList,
  getFeedActionDeps,
  getMemberActionDeps,
  showCreateFeedForm: () =>
    showCreateFeedFormLogic({
      createNewFeed: (name) => createNewFeed(name, getFeedActionDeps()),
      getFeeds: () => feedsList,
    }),
  toggleFeedExpansion,
  openFeedPosts,
  requestProfileViewersRefreshConfirmation: () =>
    setProfileViewersRefreshConfirmation(true),
  cancelProfileViewersRefreshConfirmation: () =>
    setProfileViewersRefreshConfirmation(false),
  refreshProfileViewers: refreshProfileViewersNow,
  moveFeed: (sourceFeedId, targetFeedId) =>
    moveFeed(sourceFeedId, targetFeedId, getFeedActionDeps()),
  showEditFeedModal: (feed) => showEditFeedModal(feed, getFeedActionDeps()),
  showAddPeopleModal: (feed) => showAddPeopleModal(feed, getFeedActionDeps()),
  showShareFeedModal: (feed) => showShareFeedModal(feed, getFeedActionDeps()),
  showDuplicateSharedFeedModal: (feed) =>
    showDuplicateSharedFeedModal(feed, getFeedActionDeps()),
  unfollowSharedFeed: (feed) =>
    unfollowSharedFeed(feed, getFeedActionDeps()),
  deleteFeed: (feed) => deleteFeedAction(feed, getFeedActionDeps()),
  handleMemberSave: () => handleMemberSave(getMemberActionDeps()),
  handleMemberDelete: (feedId, memberId) =>
    handleMemberDelete(feedId, memberId, getMemberActionDeps()),
  showToast,
});

attachFeedSyncListeners();
sidebarUiController.start();
