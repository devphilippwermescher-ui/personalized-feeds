import type {
  FeedInfo,
  FeedMemberInfo,
  MemberEditorState,
  UserInfo,
} from './types';
import { FEED_MEMBER_ADDED_EVENT } from './sync-events';
import { getMemberStatus } from './utils';
import { openLinkedInMessage, openLinkedInProfile } from '../linkedin-profile-actions';
import {
  fetchLinkedInRelationshipStatus,
  fetchStatusesProgressively,
  invalidateCacheForUser,
  resolveProfileUrn,
  sendLinkedInConnectRequest,
  sendLinkedInFollowState,
} from '../linkedin-relationship-status';
import {
  injectSharedStyles,
} from '../../shared/ui';
import { FEEDS_SIDEBAR_CSS } from './styles';
import { renderSidebarBody, renderSidebarHeader } from './template';
import { bindSidebarDom } from './logic/dom-bindings';
import {
  animateExpandedFeedCollapse,
  centerExpandedFeedInView,
  didExpandedFeedHeightChange,
  getExpandedFeedGroupHeight,
  shouldCenterExpandedFeed,
  stabilizeCollapsedFeedItem,
} from './logic/feed-expansion-motion';
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
  persistResolvedMemberState as persistResolvedMemberStateToStore,
  updateRenderedMemberState,
} from './logic/member-actions';
import {
  loadFeedMembers as loadFeedMembersLogic,
  renderFeedPreview as renderFeedPreviewMarkup,
  renderMembersList as renderMembersListMarkup,
  toggleFeedExpansion as toggleFeedExpansionLogic,
} from './logic/feed-members';
import { showCreateFeedForm as showCreateFeedFormLogic } from './logic/create-feed-form';
import {
  captureSidebarDomSnapshot,
  getLogoUrl,
  renderSidebarInnerMarkup,
  restoreSidebarDomSnapshot,
} from './logic/sidebar-render';
import {
  checkAuth as checkAuthLogic,
  ensureInit as ensureInitLogic,
  handleSignIn as handleSignInLogic,
  handleSignOut as handleSignOutLogic,
  handleExpiredSession as handleExpiredSessionLogic,
  SESSION_EXPIRED_MESSAGE,
  toggleSidebar as toggleSidebarLogic,
} from './logic/sidebar-session';
import { DEFAULT_FEATURE_SETTINGS, loadFeatureSettings, onFeatureSettingsChange } from '../feature-settings';
import { showToast } from '../shared/toast';
import type { ProfileViewer, UserFeatureSettings } from 'shared/types';
import { getCanonicalLinkedInUsername } from '../../../../shared/linkedin-identity';
import type { Root } from 'react-dom/client';

const DASHBOARD_URL = 'https://linkedin-feed-sorter.web.app';
const PROFILE_VIEWERS_FEED_ID = '__profile_viewers__';

/** Must match `sharefeed-capture.ts` (document_start). */
const PENDING_SHARE_SESSION_KEY = 'lfa_pending_sharefeed';

/**
 * LinkedIn often strips ?sharefeed= and sometimes #sharefeed= after SPA boot.
 * sharefeed-capture.ts writes the token to sessionStorage at document_start; we merge that here.
 */
function getSharefeedTokenFromLocation(): string | null {
  try {
    const u = new URL(window.location.href);
    const fromQuery = u.searchParams.get('sharefeed');
    if (fromQuery) {
      return fromQuery;
    }
    const raw = u.hash.replace(/^#/, '');
    if (raw.startsWith('sharefeed=')) {
      return decodeURIComponent(raw.slice('sharefeed='.length).split('&')[0]);
    }
    if (raw) {
      const fromHash = new URLSearchParams(raw).get('sharefeed');
      if (fromHash) {
        return fromHash;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const persisted = sessionStorage.getItem(PENDING_SHARE_SESSION_KEY);
    if (persisted) {
      return persisted;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function stripSharefeedFromLocation(): void {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete('sharefeed');
    const raw = u.hash.replace(/^#/, '');
    if (raw.startsWith('sharefeed=')) {
      u.hash = '';
    } else if (raw) {
      const hp = new URLSearchParams(raw);
      if (hp.has('sharefeed')) {
        hp.delete('sharefeed');
        u.hash = hp.toString() ? `#${hp.toString()}` : '';
      }
    }
    window.history.replaceState({}, document.title, u.pathname + u.search + u.hash);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(PENDING_SHARE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

let sidebarOpen = false;
let currentUser: UserInfo | null = null;
let feedsList: FeedInfo[] = [];
let sharedFeedsList: FeedInfo[] = [];
let profileViewerMembers: FeedMemberInfo[] = [];
let sidebarEl: HTMLElement | null = null;
let triggerBtn: HTMLElement | null = null;
let isLoading = false;
let isInitializing = false;
let isPremium = false;
let authErrorMessage = '';
let featureSettings: UserFeatureSettings = DEFAULT_FEATURE_SETTINGS;
let activeFeedTab: 'owned' | 'shared' = 'owned';
let expandedFeedId: string | null = null;
let lastRenderedExpandedFeedId: string | null = null;
let loadingMembersFeedId: string | null = null;
let feedMembersById: Record<string, FeedMemberInfo[]> = {};
let activeMemberEditor: MemberEditorState | null = null;
let statusFetchController: AbortController | null = null;
let feedMemberAddedListenerAttached = false;
const feedMembersRetryState: Record<string, boolean> = {};
let sidebarSearchQuery = '';
let feedListScrollTop = 0;
let memberEditorScrollTop = 0;
let draggedFeedId: string | null = null;
let feedActionModalEl: HTMLElement | null = null;
let feedActionModalRoot: Root | null = null;
let processedShareToken: string | null = null;
let shareFollowInFlightToken: string | null = null;
let settingsMenuOpen = false;
let accountMenuOpen = false;
let sidebarBindingsFrameId: number | null = null;
let collapsingFeedId: string | null = null;
const feedPostsOpenInFlight = new Set<string>();

function extractLinkedInMemberToken(profileUrn?: string): string | null {
  if (!profileUrn) {
    return null;
  }

  const trimmed = profileUrn.trim();
  if (!trimmed) {
    return null;
  }

  if (/^ACo[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
}

function normalizeSharedFeed(feed: FeedInfo & { role?: 'reader' | 'editor' }): FeedInfo {
  return {
    ...feed,
    isShared: true,
    accessRole: feed.accessRole || feed.role,
  };
}

function profileViewerToMember(viewer: ProfileViewer): FeedMemberInfo {
  return {
    id: viewer.id,
    linkedinUrl: viewer.linkedinUrl,
    linkedinUsername: viewer.linkedinUsername,
    profileUrn: viewer.profileUrn,
    memberNumericId: viewer.memberNumericId,
    canMessage: viewer.canMessage,
    canFollow: viewer.canFollow,
    canConnect: viewer.canConnect,
    isFollowing: viewer.isFollowing,
    isPremium: viewer.isPremium,
    displayName: viewer.displayName,
    headline: viewer.headline || '',
    profileImageUrl: viewer.profileImageUrl || '',
    connectionDegree: viewer.connectionDegree || '',
    viewedAgoText: viewer.viewedAgoText || '',
    mutualConnectionsText: viewer.mutualConnectionsText || '',
    status: viewer.status,
    firstSeenAt: viewer.firstSeenAt,
    lastSeenAt: viewer.lastSeenAt,
    addedAt: viewer.lastSeenAt,
  };
}

function createProfileViewersFeed(): FeedInfo {
  return {
    id: PROFILE_VIEWERS_FEED_ID,
    name: 'Profile Visitors',
    description: 'Auto-saved LinkedIn profile viewers',
    color: '#0A66C2',
    memberCount: profileViewerMembers.length,
    sortOrder: -1,
    ownerId: currentUser?.userId,
    isSystem: true,
    systemType: 'profileViewers',
  };
}

function withProfileViewersFeed(feeds: FeedInfo[]): FeedInfo[] {
  if (!currentUser) {
    return feeds.filter((feed) => feed.id !== PROFILE_VIEWERS_FEED_ID);
  }

  return [
    createProfileViewersFeed(),
    ...feeds.filter((feed) => feed.id !== PROFILE_VIEWERS_FEED_ID),
  ];
}

function updateProfileViewersState(viewers: ProfileViewer[]): void {
  profileViewerMembers = viewers.map(profileViewerToMember);
  feedMembersById = {
    ...feedMembersById,
    [PROFILE_VIEWERS_FEED_ID]: profileViewerMembers,
  };
  feedsList = withProfileViewersFeed(feedsList);
}

async function refreshProfileViewers(): Promise<void> {
  const response = await sendMsg({ type: 'PROFILE_VIEWERS_GET' });
  if (!Array.isArray(response?.viewers)) {
    return;
  }

  updateProfileViewersState(response.viewers as ProfileViewer[]);
}

async function syncProfileViewersManually(messageType: string, label: string): Promise<void> {
  loadingMembersFeedId = PROFILE_VIEWERS_FEED_ID;
  expandedFeedId = PROFILE_VIEWERS_FEED_ID;
  renderSidebarContent();

  const syncResponse = await sendMsg({ type: messageType });
  if (!syncResponse?.success) {
    loadingMembersFeedId = null;
    renderSidebarContent();
    showToast((syncResponse?.error as string) || `Failed to refresh profile visitors via ${label}`, 'error');
    return;
  }

  await refreshProfileViewers();
  await loadFeedMembers(PROFILE_VIEWERS_FEED_ID);

  const visibleCount = Number(syncResponse.visibleCount || 0);
  const newCount = Number(syncResponse.newCount || 0);
  showToast(
    newCount > 0
      ? `${newCount} new profile visitor${newCount === 1 ? '' : 's'} saved via ${label}`
      : visibleCount > 0
        ? `Profile visitors are up to date via ${label}`
        : `No visible profile visitors found via ${label}`,
    visibleCount > 0 ? 'success' : 'error'
  );
}

async function refreshProfileViewersViaApi(): Promise<void> {
  await syncProfileViewersManually('PROFILE_VIEWERS_SYNC_API_NOW', 'API');
}

async function refreshProfileViewersViaPage(): Promise<void> {
  await syncProfileViewersManually('PROFILE_VIEWERS_SYNC_PAGE_NOW', 'LinkedIn page');
}

async function refreshSharedFeeds(): Promise<void> {
  const sharedResp = await sendMsg({ type: 'FEEDS_GET_SHARED_ALL' });

  if (!Array.isArray(sharedResp?.sharedFeeds)) {
    return;
  }

  sharedFeedsList = (sharedResp.sharedFeeds as Array<FeedInfo & { role?: 'reader' | 'editor' }>).map(normalizeSharedFeed);
}

async function openFeedPosts(feedId: string): Promise<void> {
  if (feedPostsOpenInFlight.has(feedId)) {
    return;
  }

  feedPostsOpenInFlight.add(feedId);

  try {
    const feed = [...feedsList, ...sharedFeedsList].find((item) => item.id === feedId);
    if (!feed) {
      showToast('Feed not found', 'error');
      return;
    }

    if (feed.systemType === 'profileViewers') {
      await toggleFeedExpansion(feed.id);
      return;
    }

    let members = feedMembersById[feedId];
    if (!members && (feed.memberCount || 0) > 0) {
      await loadFeedMembers(feedId);
      members = feedMembersById[feedId];
    }

    const loadedMembers = members || [];
    if (loadedMembers.length === 0) {
      showToast('This feed has no profiles yet', 'error');
      return;
    }

    let resolvedAnyProfileUrn = false;
    for (const member of loadedMembers) {
      if (extractLinkedInMemberToken(member.profileUrn) || !member.linkedinUsername) {
        continue;
      }

      try {
        const resolvedProfileUrn = await resolveProfileUrn(member.linkedinUsername);
        if (resolvedProfileUrn) {
          member.profileUrn = resolvedProfileUrn;
          resolvedAnyProfileUrn = true;
        }
      } catch {
        // Ignore unresolved members and continue with the rest.
      }
    }

    if (resolvedAnyProfileUrn) {
      renderSidebarContent();
    }

    const memberTokens = Array.from(
      new Set(
        loadedMembers
          .map((member) => extractLinkedInMemberToken(member.profileUrn))
          .filter((token): token is string => Boolean(token))
      )
    );

    if (memberTokens.length === 0) {
      showToast('Could not resolve LinkedIn member IDs for this feed yet', 'error');
      return;
    }

    const searchUrl = new URL('https://www.linkedin.com/search/results/content/');
    searchUrl.searchParams.set('origin', 'FACETED_SEARCH');
    searchUrl.searchParams.set('sortBy', JSON.stringify(['date_posted']));
    searchUrl.searchParams.set('fromMember', JSON.stringify(memberTokens));

    window.open(searchUrl.toString(), '_blank');
  } finally {
    window.setTimeout(() => {
      feedPostsOpenInFlight.delete(feedId);
    }, 1200);
  }
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

async function handleExternalMemberAdded(detail: { feedId: string; feedName: string; member: FeedMemberInfo }): Promise<void> {
  const incrementMemberCount = (feed: FeedInfo): FeedInfo =>
    feed.id === detail.feedId
      ? {
          ...feed,
          memberCount: (feed.memberCount || 0) + 1,
        }
      : feed;
  feedsList = feedsList.map(incrementMemberCount);
  sharedFeedsList = sharedFeedsList.map(incrementMemberCount);

  const existingMembers = feedMembersById[detail.feedId] || [];
  const memberWithLoadingState: FeedMemberInfo = {
    ...detail.member,
    linkedinUsername: getCanonicalLinkedInUsername(detail.member),
    status: 'loading' as const,
  };
  const incomingUsername = getCanonicalLinkedInUsername(memberWithLoadingState);
  const exists = existingMembers.some(
    (member) => member.id === detail.member.id || getCanonicalLinkedInUsername(member) === incomingUsername
  );

  if (!exists) {
    feedMembersById = {
      ...feedMembersById,
      [detail.feedId]: [...existingMembers, memberWithLoadingState],
    };
  }
  renderSidebarContent();

  if (expandedFeedId === detail.feedId) {
    await loadFeedMembers(detail.feedId);
    return;
  }

  try {
    const status = await fetchLinkedInRelationshipStatus(memberWithLoadingState);
    Object.assign(memberWithLoadingState, status);
  } catch {
    memberWithLoadingState.status = undefined;
    memberWithLoadingState.status = getMemberStatus(memberWithLoadingState);
  }

  if (!updateRenderedMemberStateLocal(detail.feedId, memberWithLoadingState)) {
    renderSidebarContent();
  }
}

function attachFeedSyncListeners(): void {
  if (feedMemberAddedListenerAttached) {
    return;
  }

  feedMemberAddedListenerAttached = true;

  window.addEventListener(FEED_MEMBER_ADDED_EVENT, ((event: Event) => {
    const customEvent = event as CustomEvent<{ feedId: string; feedName: string; member: FeedMemberInfo }>;
    if (customEvent.detail) {
      void handleExternalMemberAdded(customEvent.detail);
    }
  }) as EventListener);
}

// ── Messaging ──

function sendMsg(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (response?.error === SESSION_EXPIRED_MESSAGE) {
        handleExpiredSessionLogic({
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
            feedsList = feeds as FeedInfo[];
          },
          setSharedFeeds: (feeds) => {
            sharedFeedsList = feeds as FeedInfo[];
          },
          setExpandedFeedId: (value) => {
            expandedFeedId = value;
          },
          setActiveMemberEditor: () => {
            activeMemberEditor = null;
          },
          setAuthErrorMessage: (value) => {
            authErrorMessage = value;
          },
          setIsLoading: (value) => {
            isLoading = value;
          },
          setIsInitializing: (value) => {
            isInitializing = value;
          },
          renderSidebarContent,
        });
      }

      resolve(response || {});
    });
  });
}

// ── Auth ──

async function checkAuth(): Promise<void> {
  await checkAuthLogic({
    sendMsg,
    setCurrentUser: (user) => {
      currentUser = user;
    },
    setAuthErrorMessage: (value) => {
      authErrorMessage = value;
    },
  });
}

async function handleSignIn(): Promise<void> {
  await handleSignInLogic({
    sendMsg,
    setIsLoading: (value) => {
      isLoading = value;
    },
    setAuthErrorMessage: (value) => {
      authErrorMessage = value;
    },
    renderSidebarContent,
    loadFeeds,
    setCurrentUser: (user) => {
      currentUser = user;
    },
  });
}

async function handleSignOut(): Promise<void> {
  await handleSignOutLogic({
    sendMsg,
    setCurrentUser: (user) => {
      currentUser = user;
    },
    setFeeds: (feeds) => {
      feedsList = feeds as FeedInfo[];
      sharedFeedsList = [];
      profileViewerMembers = [];
      const nextFeedMembersById = { ...feedMembersById };
      delete nextFeedMembersById[PROFILE_VIEWERS_FEED_ID];
      feedMembersById = nextFeedMembersById;
      activeFeedTab = 'owned';
    },
    renderSidebarContent,
  });
}

// ── Feeds ──

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
    updateProfileViewersState(profileViewersResp.viewers as ProfileViewer[]);
  } else {
    feedsList = withProfileViewersFeed(feedsList);
  }

  if (Array.isArray(sharedResp?.sharedFeeds)) {
    sharedFeedsList = (sharedResp.sharedFeeds as Array<FeedInfo & { role?: 'reader' | 'editor' }>).map(normalizeSharedFeed);
  }

  await handlePendingSharedFeedLink();
}

async function handlePendingSharedFeedLink(): Promise<void> {
  if (!currentUser) {
    return;
  }

  const token = getSharefeedTokenFromLocation();
  if (!token || processedShareToken === token || shareFollowInFlightToken === token) {
    return;
  }

  shareFollowInFlightToken = token;

  try {
    const response = await sendMsg({ type: 'FEEDS_FOLLOW_SHARE_LINK', token });
    if (!response?.success || !response.sharedFeed) {
      const error = (response?.error as string) || '';
      // Session recovery and share propagation can race with the auto-open flow.
      // For those transient cases, keep the token retryable and avoid a false error toast.
      const isRetryable =
        error === SESSION_EXPIRED_MESSAGE ||
        error.toLowerCase().includes('permission denied');

      if (!isRetryable) {
        processedShareToken = token;
        showToast(error || 'Failed to follow shared feed', 'error');
      }
      return;
    }

    processedShareToken = token;

    const sharedFeed = normalizeSharedFeed(response.sharedFeed as FeedInfo & { role?: 'reader' | 'editor' });

    if (!sharedFeedsList.some((feed) => feed.id === sharedFeed.id && feed.ownerId === sharedFeed.ownerId)) {
      sharedFeedsList = [sharedFeed, ...sharedFeedsList];
    }

    activeFeedTab = 'shared';
    renderSidebarContent();
    showSharedFeedFollowedModal(sharedFeed.name, sharedFeed.ownerDisplayName || 'Unknown user', getFeedActionDeps());

    stripSharefeedFromLocation();
  } finally {
    if (shareFollowInFlightToken === token) {
      shareFollowInFlightToken = null;
    }
  }
}

async function tryConsumePendingShareLink(): Promise<void> {
  if (!currentUser || !getSharefeedTokenFromLocation()) {
    return;
  }
  await handlePendingSharedFeedLink();
}

function schedulePendingShareRetries(): void {
  let n = 0;
  const max = 40;
  const id = window.setInterval(() => {
    n += 1;
    if (n > max) {
      window.clearInterval(id);
      return;
    }
    void tryConsumePendingShareLink();
  }, 500);
}

async function loadFeedMembers(feedId: string): Promise<void> {
  await loadFeedMembersLogic(feedId, {
    sendMsg,
    renderSidebarContent,
    fetchStatusesProgressively,
    persistResolvedMemberState,
    updateRenderedMemberState: updateRenderedMemberStateLocal,
    getStatusFetchController: () => statusFetchController,
    setStatusFetchController: (controller) => {
      statusFetchController = controller;
    },
    getLoadingMembersFeedId: () => loadingMembersFeedId,
    setLoadingMembersFeedId: (feedIdValue) => {
      loadingMembersFeedId = feedIdValue;
    },
    getFeedMembersById: () => feedMembersById,
    setFeedMembersById: (value) => {
      feedMembersById = value;
    },
    getFeedMembersRetryState: () => feedMembersRetryState,
    setFeedMembersRetryState: (value) => {
      Object.keys(feedMembersRetryState).forEach((key) => delete feedMembersRetryState[key]);
      Object.assign(feedMembersRetryState, value);
    },
    getExpandedFeedId: () => expandedFeedId,
    setExpandedFeedId: (feedIdValue) => {
      expandedFeedId = feedIdValue;
    },
    setActiveMemberEditor: (value) => {
      activeMemberEditor = value;
    },
    getFeeds: () => [...feedsList, ...sharedFeedsList],
  });
}

async function persistResolvedMemberState(feedId: string, member: FeedMemberInfo): Promise<void> {
  await persistResolvedMemberStateToStore(feedId, member, { sendMsg, getFeeds: () => [...feedsList, ...sharedFeedsList] });
}

async function toggleFeedExpansion(feedId: string): Promise<void> {
  if (collapsingFeedId) {
    return;
  }

  const currentlyExpandedFeedId = expandedFeedId;
  if (currentlyExpandedFeedId && sidebarEl) {
    collapsingFeedId = currentlyExpandedFeedId;
    await animateExpandedFeedCollapse(sidebarEl, currentlyExpandedFeedId);
    collapsingFeedId = null;
  }

  await toggleFeedExpansionLogic(feedId, {
    sendMsg,
    renderSidebarContent,
    fetchStatusesProgressively,
    persistResolvedMemberState,
    updateRenderedMemberState: updateRenderedMemberStateLocal,
    getStatusFetchController: () => statusFetchController,
    setStatusFetchController: (controller) => {
      statusFetchController = controller;
    },
    getLoadingMembersFeedId: () => loadingMembersFeedId,
    setLoadingMembersFeedId: (feedIdValue) => {
      loadingMembersFeedId = feedIdValue;
    },
    getFeedMembersById: () => feedMembersById,
    setFeedMembersById: (value) => {
      feedMembersById = value;
    },
    getFeedMembersRetryState: () => feedMembersRetryState,
    setFeedMembersRetryState: (value) => {
      Object.keys(feedMembersRetryState).forEach((key) => delete feedMembersRetryState[key]);
      Object.assign(feedMembersRetryState, value);
    },
    getExpandedFeedId: () => expandedFeedId,
    setExpandedFeedId: (feedIdValue) => {
      expandedFeedId = feedIdValue;
    },
    setActiveMemberEditor: (value) => {
      activeMemberEditor = value;
    },
    getFeeds: () => [...feedsList, ...sharedFeedsList],
  });

  if (currentlyExpandedFeedId && sidebarEl) {
    stabilizeCollapsedFeedItem(sidebarEl, currentlyExpandedFeedId);
  }
}

function renderMembersList(feed: FeedInfo): string {
  return renderMembersListMarkup(feed, {
    getLoadingMembersFeedId: () => loadingMembersFeedId,
    getFeedMembersById: () => feedMembersById,
    getMessagingButtonsEnabled: () => featureSettings.messagingButtons,
  });
}

function getMemberActionDeps() {
  return {
    sendMsg,
    showToast,
    renderSidebarContent,
    openLinkedInMessage,
    openLinkedInProfile,
    fetchLinkedInRelationshipStatus,
    resolveProfileUrn,
    sendLinkedInConnectRequest,
    sendLinkedInFollowState,
    invalidateCacheForUser,
    getMessagingButtonsEnabled: () => featureSettings.messagingButtons,
    getFeedMembersById: () => feedMembersById,
    setFeedMembersById: (value: Record<string, FeedMemberInfo[]>) => {
      feedMembersById = value;
    },
    getFeeds: () => [...feedsList, ...sharedFeedsList],
    loadFeeds,
    getActiveMemberEditor: () => activeMemberEditor,
    setActiveMemberEditor: (value: MemberEditorState | null) => {
      activeMemberEditor = value;
    },
    setExpandedFeedId: (feedId: string | null) => {
      expandedFeedId = feedId;
    },
    loadFeedMembers,
  };
}

function updateRenderedMemberStateLocal(feedId: string, member: FeedMemberInfo): boolean {
  return updateRenderedMemberState(sidebarEl, feedId, member, getMemberActionDeps());
}

// renderEditorField replaced by shared/ui components (renderLfsInput, renderLfsDropdown)

// ── CSS ──

function injectStyles(): void {
  if (document.getElementById('lfa-sidebar-styles')) return;
  injectSharedStyles();
  const style = document.createElement('style');
  style.id = 'lfa-sidebar-styles';
  style.textContent = FEEDS_SIDEBAR_CSS;
  document.head.appendChild(style);
}

// ── UI Creation ──

function createTriggerButton(): HTMLElement {
  const logoUrl = getLogoUrl();
  const btn = document.createElement('div');
  btn.className = 'lfa-trigger-btn';
  btn.id = 'lfa-feeds-trigger-btn';
  btn.setAttribute('data-extension', 'linkedin-analyzer-feeds');
  btn.title = 'myFeedPilot - Feeds';
  btn.innerHTML = `<img src="${logoUrl}" alt="myFeedPilot" />`;
  btn.addEventListener('click', toggleSidebar);
  return btn;
}

function renderSidebarInner(container: HTMLElement): void {
  const previousRenderedExpandedFeedId = lastRenderedExpandedFeedId;
  const nextRenderedExpandedFeedId = expandedFeedId;
  const previousExpandedFeedHeight = getExpandedFeedGroupHeight(container, nextRenderedExpandedFeedId);
  const shouldCenterFeed = shouldCenterExpandedFeed(previousRenderedExpandedFeedId, nextRenderedExpandedFeedId);
  const snapshot = captureSidebarDomSnapshot(container, {
    feedListScrollTop,
    memberEditorScrollTop,
    searchQuery: sidebarSearchQuery,
  });

  renderSidebarInnerMarkup({
    container,
    currentUser,
    featureSettings,
    feedsList,
    sharedFeedsList,
    sidebarSearchQuery,
    activeFeedTab,
    expandedFeedId,
    activeMemberEditor,
    renderSidebarHeader,
    renderSidebarBody,
    renderFeedPreview: (feedId) => renderFeedPreviewMarkup(feedId, feedMembersById),
    renderMembersList,
    isLoading,
    isInitializing,
    isPremium,
    authErrorMessage,
    getLogoUrl,
  });

  if (settingsMenuOpen) {
    container.querySelector('#lfa-settings-menu')?.classList.add('lfa-settings-menu--open');
  }
  if (accountMenuOpen) {
    container.querySelector('#lfa-account-menu')?.classList.add('lfa-account-menu--open');
  }

  restoreSidebarDomSnapshot(container, snapshot, (restoredSnapshot) => {
    feedListScrollTop = restoredSnapshot.feedListScrollTop;
    memberEditorScrollTop = restoredSnapshot.memberEditorScrollTop;
    sidebarSearchQuery = restoredSnapshot.searchQuery;
    const nextExpandedFeedHeight = getExpandedFeedGroupHeight(container, nextRenderedExpandedFeedId);

    if (
      nextRenderedExpandedFeedId &&
      (shouldCenterFeed || didExpandedFeedHeightChange(previousExpandedFeedHeight, nextExpandedFeedHeight))
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
      toggleSidebar,
      handleSignIn,
      handleSignOut,
      showCreateFeedForm,
      selectFeedTab: (tab) => {
        activeFeedTab = tab;
        expandedFeedId = null;
        activeMemberEditor = null;
        sidebarSearchQuery = '';
        renderSidebarContent();

        if (tab === 'shared') {
          void refreshSharedFeeds().then(() => {
            if (activeFeedTab === 'shared') {
              renderSidebarContent();
            }
          });
        }
      },
      openProfileSettings: () => window.open(`${DASHBOARD_URL}/settings/profile`, '_blank'),
      openSubscription: () => window.open(`${DASHBOARD_URL}/subscription`, '_blank'),
      updateFeatureSetting: async (key, value) => {
        const response = await sendMsg({
          type: 'SETTINGS_UPDATE',
          updates: { [key]: value },
        });

        if (!response?.success) {
          showToast((response?.error as string) || 'Failed to update settings', 'error');
          return;
        }

        featureSettings = {
          ...featureSettings,
          ...(response.settings as Partial<UserFeatureSettings>),
        };
      },
      renderSidebarContent,
      handleMemberSave: () => handleMemberSave(getMemberActionDeps()),
      filterFeeds,
      toggleFeedExpansion,
      openFeedPosts,
      moveFeed: (sourceFeedId, targetFeedId) => moveFeed(sourceFeedId, targetFeedId, getFeedActionDeps()),
      showEditFeedModal: (feed) => showEditFeedModal(feed, getFeedActionDeps()),
      showAddPeopleModal: (feed) => showAddPeopleModal(feed, getFeedActionDeps()),
      showShareFeedModal: (feed) => showShareFeedModal(feed, getFeedActionDeps()),
      showDuplicateSharedFeedModal: (feed) => showDuplicateSharedFeedModal(feed, getFeedActionDeps()),
      unfollowSharedFeed: (feed) => unfollowSharedFeed(feed, getFeedActionDeps()),
      deleteFeed: (feed) => deleteFeedAction(feed, getFeedActionDeps()),
      refreshProfileViewersViaApi,
      refreshProfileViewersViaPage,
      handleMemberDelete: (feedId, memberId) => handleMemberDelete(feedId, memberId, getMemberActionDeps()),
      openDashboard: () => window.open(DASHBOARD_URL, '_blank'),
      getFeeds: () => (activeFeedTab === 'owned' ? feedsList : sharedFeedsList),
      getFeedMembersById: () => feedMembersById,
      setActiveMemberEditor: (state) => {
        activeMemberEditor = state;
      },
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
      memberActionDeps: getMemberActionDeps(),
      togglePlan: () => {
        const newPlan = isPremium ? 'free' : 'premium';
        isPremium = newPlan === 'premium';
        chrome.storage.local.set({ pf_userPlan: newPlan });
        renderSidebarContent();
      },
    });
  });
}

function renderSidebarContent(): void {
  if (sidebarEl) renderSidebarInner(sidebarEl);
}

// ── Interactions ──

function toggleSidebar(): void {
  settingsMenuOpen = false;
  accountMenuOpen = false;
  toggleSidebarLogic({
    getSidebarOpen: () => sidebarOpen,
    setSidebarOpen: (value) => {
      sidebarOpen = value;
    },
    getSidebarEl: () => sidebarEl,
    getTriggerBtn: () => triggerBtn,
    setIsInitializing: (value) => {
      isInitializing = value;
    },
    renderSidebarContent,
    setIsPremium: (value) => {
      isPremium = value;
    },
    getIsPremium: () => isPremium,
    getCurrentUser: () => currentUser,
    loadFeeds,
    sendMsg,
    setCurrentUser: (user) => {
      currentUser = user;
    },
    setAuthErrorMessage: (value) => {
      authErrorMessage = value;
    },
  });
}

function filterFeeds(query: string): void {
  sidebarSearchQuery = query;
  const normalizedQuery = query.trim().toLowerCase();
  const groups = document.querySelectorAll<HTMLElement>('.lfa-feed-group');

  groups.forEach((group) => {
    const name = group.querySelector('.lfa-feed-name')?.textContent?.toLowerCase() || '';
    group.style.display = !normalizedQuery || name.includes(normalizedQuery) ? '' : 'none';
  });
}

function showCreateFeedForm(): void {
  showCreateFeedFormLogic({
    createNewFeed: (name) => createNewFeed(name, getFeedActionDeps()),
    getFeeds: () => feedsList,
  });
}

// ── Init ──

function init(): void {
  if (document.getElementById('lfa-sidebar')) return;

  injectStyles();
  attachFeedSyncListeners();
  onFeatureSettingsChange((settings) => {
    featureSettings = settings;
    if (sidebarOpen && !settingsMenuOpen) {
      renderSidebarContent();
    }
  });

  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'lfa-sidebar-overlay';
  overlay.className = 'lfa-sidebar-overlay';
  overlay.addEventListener('click', toggleSidebar);
  document.body.appendChild(overlay);

  // Trigger button (always visible on LinkedIn)
  triggerBtn = createTriggerButton();
  document.body.appendChild(triggerBtn);

  // Sidebar
  sidebarEl = document.createElement('div');
  sidebarEl.className = 'lfa-sidebar';
  sidebarEl.id = 'lfa-sidebar';
  renderSidebarInner(sidebarEl);
  document.body.appendChild(sidebarEl);
}

function ensureInit(): void {
  ensureInitLogic({
    setIsPremium: (value) => {
      isPremium = value;
    },
    init,
  });
}

// Run on load: always show the button on LinkedIn; premium is checked when panel opens
ensureInit();

schedulePendingShareRetries();

// If there's a pending share token, proactively resolve auth before the auto-open timer fires.
// This ensures currentUser is set so schedulePendingShareRetries retries can proceed even
// when background cold-start auth resolves slower than the 1500 ms auto-open delay.
if (getSharefeedTokenFromLocation()) {
  void checkAuth();
}

// Auto-open sidebar when a share link is in the URL, query, hash, or sessionStorage (see sharefeed-capture)
setTimeout(() => {
  if (getSharefeedTokenFromLocation() && !sidebarOpen) {
    toggleSidebar();
  }
}, 1500);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pf_userPlan) {
    isPremium = changes.pf_userPlan.newValue === 'premium';
    if (sidebarOpen) renderSidebarContent();
  }
});
