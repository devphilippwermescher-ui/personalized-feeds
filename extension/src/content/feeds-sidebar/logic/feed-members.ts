import type { FeedInfo, FeedMemberInfo, MemberEditorState } from '../types';
import { canMemberReceiveMessage, getMemberInitials, getMemberStatus } from '../utils';
import { renderFeedActions } from './feed-actions';
import { renderMemberRow } from '../components/MemberRow/MemberRow';
import { renderMemberStatusAction, renderMessageButton } from './member-actions';
import { CONTENT_COPY } from '../../shared/copy';
import { buildRecruiterAggregateMember } from './profile-viewers-feed';
import type { ProfileViewerListItem, ProfileViewerSummary } from 'shared/types';

const PROFILE_VIEWER_STATUS_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const PROFILE_VIEWER_STATUS_REFRESH_BATCH_LIMIT = 20;
const PROFILE_VIEWER_STATUS_REFRESH_BATCH_COOLDOWN_MS = 5 * 60 * 1000;
const profileViewerStatusRefreshInFlight = new Set<string>();
let profileViewerStatusRefreshLastStartedAt = 0;
let profileViewerStatusRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let profileViewerStatusRefreshCycleActive = false;

interface FeedMembersDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  renderSidebarContent: () => void;
  fetchStatusesProgressively: (
    members: FeedMemberInfo[],
    onProgress: (member: FeedMemberInfo) => void,
    signal: AbortSignal
  ) => Promise<void>;
  persistResolvedMemberState: (feedId: string, member: FeedMemberInfo) => Promise<void>;
  updateRenderedMemberState: (feedId: string, member: FeedMemberInfo) => boolean;
  getStatusFetchController: () => AbortController | null;
  setStatusFetchController: (controller: AbortController | null) => void;
  getLoadingMembersFeedId: () => string | null;
  setLoadingMembersFeedId: (feedId: string | null) => void;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  setFeedMembersById: (value: Record<string, FeedMemberInfo[]>) => void;
  getFeedMembersRetryState: () => Record<string, boolean>;
  setFeedMembersRetryState: (value: Record<string, boolean>) => void;
  getExpandedFeedId: () => string | null;
  setExpandedFeedId: (feedId: string | null) => void;
  setActiveMemberEditor: (value: MemberEditorState | null) => void;
  getFeeds: () => FeedInfo[];
}

function getProfileStatusRefreshKey(member: FeedMemberInfo): string {
  return (member.linkedinUsername || member.id).trim().toLowerCase();
}

function shouldRefreshProfileViewerStatus(member: FeedMemberInfo, now = Date.now()): boolean {
  if (member.itemType && member.itemType !== 'profile') {
    return false;
  }

  const key = getProfileStatusRefreshKey(member);
  if (!key || profileViewerStatusRefreshInFlight.has(key)) {
    return false;
  }

  if (!member.status || member.status === 'loading') {
    return (
      typeof member.statusResolvedAt !== 'number' ||
      now - member.statusResolvedAt >= PROFILE_VIEWER_STATUS_REFRESH_INTERVAL_MS
    );
  }

  return (
    typeof member.statusResolvedAt !== 'number' ||
    now - member.statusResolvedAt >= PROFILE_VIEWER_STATUS_REFRESH_INTERVAL_MS
  );
}

function getProfileViewerMembersForStatusRefresh(members: FeedMemberInfo[]): FeedMemberInfo[] {
  const now = Date.now();
  return members
    .filter((member) => shouldRefreshProfileViewerStatus(member, now))
    .slice(0, PROFILE_VIEWER_STATUS_REFRESH_BATCH_LIMIT);
}

function clearProfileViewerStatusRefreshTimer(): void {
  if (profileViewerStatusRefreshTimer) {
    clearTimeout(profileViewerStatusRefreshTimer);
    profileViewerStatusRefreshTimer = null;
  }
}

function getProfileViewerStatusRefreshCooldownMs(now = Date.now()): number {
  if (!profileViewerStatusRefreshLastStartedAt) {
    return 0;
  }

  return Math.max(
    0,
    profileViewerStatusRefreshLastStartedAt + PROFILE_VIEWER_STATUS_REFRESH_BATCH_COOLDOWN_MS - now
  );
}

function scheduleProfileViewerStatusRefresh(
  feedId: string,
  deps: FeedMembersDeps,
  delayMs = getProfileViewerStatusRefreshCooldownMs()
): void {
  if (profileViewerStatusRefreshTimer || delayMs <= 0) {
    return;
  }

  profileViewerStatusRefreshTimer = setTimeout(() => {
    profileViewerStatusRefreshTimer = null;
    const members = deps.getFeedMembersById()[feedId] || [];
    startBackgroundStatusRefresh(feedId, members, deps, {
      profileViewersOnly: true,
      continueProfileViewerCycle: true,
    });
  }, delayMs);
}

function startBackgroundStatusRefresh(
  feedId: string,
  members: FeedMemberInfo[],
  deps: FeedMembersDeps,
  options: { profileViewersOnly?: boolean; continueProfileViewerCycle?: boolean } = {}
): void {
  const profileMembers = options.profileViewersOnly
    ? getProfileViewerMembersForStatusRefresh(members)
    : members.some((member) => member.itemType && member.itemType !== 'profile')
      ? members.filter((member) => !member.itemType || member.itemType === 'profile')
      : members;
  if (profileMembers.length === 0) {
    if (options.continueProfileViewerCycle) {
      profileViewerStatusRefreshCycleActive = false;
    }
    return;
  }

  if (options.profileViewersOnly) {
    const cooldownMs = getProfileViewerStatusRefreshCooldownMs();
    if (cooldownMs > 0) {
      scheduleProfileViewerStatusRefresh(feedId, deps, cooldownMs);
      return;
    }

    profileViewerStatusRefreshLastStartedAt = Date.now();
    clearProfileViewerStatusRefreshTimer();
  }

  const profileViewerRefreshKeys = options.profileViewersOnly
    ? profileMembers.map(getProfileStatusRefreshKey).filter(Boolean)
    : [];
  profileViewerRefreshKeys.forEach((key) => profileViewerStatusRefreshInFlight.add(key));

  deps.getStatusFetchController()?.abort();
  const controller = new AbortController();
  deps.setStatusFetchController(controller);

  void deps.fetchStatusesProgressively(
    profileMembers,
    (member) => {
      if (options.profileViewersOnly && !member.status) {
        member.status = 'connect';
        member.statusResolvedAt = Date.now();
      }
      void deps.persistResolvedMemberState(feedId, member);
      if (!deps.updateRenderedMemberState(feedId, member)) {
        deps.renderSidebarContent();
      }
    },
    controller.signal
  ).finally(() => {
    profileViewerRefreshKeys.forEach((key) => profileViewerStatusRefreshInFlight.delete(key));
    if (deps.getStatusFetchController() === controller) {
      deps.setStatusFetchController(null);
    }

    if (options.profileViewersOnly && options.continueProfileViewerCycle) {
      const currentMembers = deps.getFeedMembersById()[feedId] || [];
      if (getProfileViewerMembersForStatusRefresh(currentMembers).length > 0) {
        scheduleProfileViewerStatusRefresh(feedId, deps);
      } else {
        profileViewerStatusRefreshCycleActive = false;
      }
    }
  });
}

export function startProfileViewerStatusRefreshCycle(feedId: string, deps: FeedMembersDeps): void {
  if (profileViewerStatusRefreshCycleActive) {
    return;
  }

  const members = deps.getFeedMembersById()[feedId] || [];
  if (getProfileViewerMembersForStatusRefresh(members).length === 0) {
    return;
  }

  profileViewerStatusRefreshCycleActive = true;
  startBackgroundStatusRefresh(feedId, members, deps, {
    profileViewersOnly: true,
    continueProfileViewerCycle: true,
  });
}

export function resetProfileViewerStatusRefreshStateForTests(): void {
  clearProfileViewerStatusRefreshTimer();
  profileViewerStatusRefreshLastStartedAt = 0;
  profileViewerStatusRefreshCycleActive = false;
  profileViewerStatusRefreshInFlight.clear();
}

function profileViewerToMember(viewer: Partial<FeedMemberInfo> | ProfileViewerListItem): FeedMemberInfo | null {
  const itemType = 'itemType' in viewer ? viewer.itemType : undefined;
  const isSearchItem = 'searchUrl' in viewer || itemType === 'search';
  const linkedinUrl = isSearchItem
    ? ('searchUrl' in viewer ? viewer.searchUrl : viewer.linkedinUrl)
    : viewer.linkedinUrl;

  if (
    !viewer.id ||
    !linkedinUrl ||
    !viewer.displayName ||
    (!isSearchItem && !viewer.linkedinUsername)
  ) {
    return null;
  }

  return {
    id: viewer.id,
    itemType: isSearchItem ? 'search' : itemType || 'profile',
    searchKey: 'searchKey' in viewer ? viewer.searchKey : undefined,
    linkedinUrl,
    linkedinUsername: isSearchItem ? '' : viewer.linkedinUsername || '',
    displayName: viewer.displayName,
    headline: 'headline' in viewer ? viewer.headline || '' : '',
    profileImageUrl: 'profileImageUrl' in viewer ? viewer.profileImageUrl || '' : '',
    connectionDegree: 'connectionDegree' in viewer ? viewer.connectionDegree || '' : '',
    viewedAgoText: viewer.viewedAgoText || '',
    mutualConnectionsText: 'mutualConnectionsText' in viewer ? viewer.mutualConnectionsText || '' : '',
    profileUrn: 'profileUrn' in viewer ? viewer.profileUrn : undefined,
    memberNumericId: 'memberNumericId' in viewer ? viewer.memberNumericId : undefined,
    canMessage: 'canMessage' in viewer ? viewer.canMessage : undefined,
    canFollow: 'canFollow' in viewer ? viewer.canFollow : undefined,
    canConnect: 'canConnect' in viewer ? viewer.canConnect : undefined,
    isFollowing: 'isFollowing' in viewer ? viewer.isFollowing : undefined,
    isPremium: 'isPremium' in viewer ? viewer.isPremium : undefined,
    status: 'status' in viewer ? viewer.status : undefined,
    statusResolvedAt: 'statusResolvedAt' in viewer ? viewer.statusResolvedAt : undefined,
    firstSeenAt: viewer.firstSeenAt,
    lastSeenAt: viewer.lastSeenAt,
    addedAt: viewer.lastSeenAt || Date.now(),
  };
}

export function getStaleFeedMemberCacheIds(
  feeds: FeedInfo[],
  feedMembersById: Record<string, FeedMemberInfo[]>
): string[] {
  return feeds
    .filter((feed) => {
      if (feed.systemType === 'profileViewers') {
        return false;
      }

      const cachedMembers = feedMembersById[feed.id];
      return Array.isArray(cachedMembers) && cachedMembers.length !== (feed.memberCount || 0);
    })
    .map((feed) => feed.id);
}

export async function loadFeedMembers(feedId: string, deps: FeedMembersDeps): Promise<void> {
  deps.setLoadingMembersFeedId(feedId);
  deps.renderSidebarContent();

  const feed = deps.getFeeds().find((item) => item.id === feedId);
  if (feed?.systemType === 'profileViewers') {
    const resp = await deps.sendMsg({ type: 'PROFILE_VIEWERS_GET' });
    const members = ((resp?.viewers as Partial<FeedMemberInfo>[]) || [])
      .map(profileViewerToMember)
      .filter((member): member is FeedMemberInfo => Boolean(member));
    const recruiterAggregateMember = buildRecruiterAggregateMember(
      (resp?.summary as ProfileViewerSummary | null | undefined) || null
    );
    const nextMembers = recruiterAggregateMember
      ? [recruiterAggregateMember, ...members]
      : members;

    deps.setFeedMembersById({
      ...deps.getFeedMembersById(),
      [feedId]: nextMembers,
    });
    deps.setLoadingMembersFeedId(null);
    deps.renderSidebarContent();
    return;
  }

  const resp = await deps.sendMsg({ type: 'FEEDS_GET_MEMBERS', ownerId: feed?.ownerId, feedId });
  const members = ((resp?.members as FeedMemberInfo[]) || []).map((member) => ({
    ...member,
    status: !feed?.isShared ? ('loading' as const) : member.status || ('loading' as const),
  }));

  deps.setFeedMembersById({
    ...deps.getFeedMembersById(),
    [feedId]: members,
  });
  deps.setFeedMembersRetryState({
    ...deps.getFeedMembersRetryState(),
    [feedId]: false,
  });
  deps.setLoadingMembersFeedId(null);
  deps.renderSidebarContent();

  // Relationship statuses belong to the owner's context; don't resolve or persist them
  // when a recipient is browsing a shared feed.
  if (!feed?.isShared) {
    startBackgroundStatusRefresh(feedId, members, deps);
  }
}

export async function toggleFeedExpansion(feedId: string, deps: FeedMembersDeps): Promise<void> {
  if (deps.getExpandedFeedId() === feedId) {
    deps.setExpandedFeedId(null);
    deps.setActiveMemberEditor(null);
    deps.getStatusFetchController()?.abort();
    deps.setStatusFetchController(null);
    deps.renderSidebarContent();
    return;
  }

  deps.setExpandedFeedId(feedId);
  deps.setActiveMemberEditor(null);

  if (!deps.getFeedMembersById()[feedId]) {
    await loadFeedMembers(feedId, deps);
    return;
  }

  const feed = deps.getFeeds().find((item) => item.id === feedId);
  const cachedMembers = deps.getFeedMembersById()[feedId] || [];
  const isProfileViewersFeed = feed?.systemType === 'profileViewers';
  let membersForRefresh = cachedMembers;
  if (!feed?.isShared && !isProfileViewersFeed && cachedMembers.length > 0) {
    membersForRefresh = cachedMembers.map((member) => ({
      ...member,
      status: 'loading' as const,
    }));
    deps.setFeedMembersById({
      ...deps.getFeedMembersById(),
      [feedId]: membersForRefresh,
    });
  }
  const retryState = deps.getFeedMembersRetryState();
  const shouldRetryEmptyState =
    cachedMembers.length === 0 &&
    (feed?.memberCount || 0) > 0 &&
    retryState[feedId] !== true;

  if (shouldRetryEmptyState) {
    deps.setFeedMembersRetryState({
      ...retryState,
      [feedId]: true,
    });
    await loadFeedMembers(feedId, deps);
    return;
  }

  deps.renderSidebarContent();
  if (!feed?.isShared && !isProfileViewersFeed) {
    startBackgroundStatusRefresh(feedId, membersForRefresh, deps, {
      profileViewersOnly: false,
    });
  }
}

export function renderMembersList(
  feed: FeedInfo,
  deps: Pick<FeedMembersDeps, 'getLoadingMembersFeedId' | 'getFeedMembersById'> & {
    getMessagingButtonsEnabled: () => boolean;
  }
): string {
  if (deps.getLoadingMembersFeedId() === feed.id) {
    return `
      <div class="lfa-feed-expanded-header">
        ${renderFeedActions(feed)}
      </div>
      <div class="lfa-feed-members-state">
        <div class="lfa-spinner lfa-spinner--small"></div>
        <p>${CONTENT_COPY.common.loadingProfiles}</p>
      </div>
    `;
  }

  const members = deps.getFeedMembersById()[feed.id] || [];
  const canEditMembers = !feed.isShared || feed.accessRole === 'editor';
  const showMessagingButtons = !feed.isShared && deps.getMessagingButtonsEnabled();

  if (members.length === 0) {
    return `
      <div class="lfa-feed-expanded-header">
        ${renderFeedActions(feed)}
      </div>
      <div class="lfa-feed-members-empty">
        ${CONTENT_COPY.feedModals.emptyProfilesHint}
      </div>
    `;
  }

  return `
    <div class="lfa-feed-expanded-header">
      ${renderFeedActions(feed)}
    </div>
    <div class="lfa-feed-members-list">
      ${members
        .map((member) => {
          const status = getMemberStatus(member);
          if (member.itemType === 'search' || member.itemType === 'recruiterAggregate') {
            return renderMemberRow({
              feedId: feed.id,
              member,
              messageButtonHtml: '',
              statusActionHtml: '',
              canEdit: false,
              showMeta: true,
            });
          }

          const canMessage = canMemberReceiveMessage(member, status, {
            allowUnverifiedProfileMessage: feed.systemType === 'profileViewers',
          });
          // Relationship badges reflect the owner's connection context.
          // In shared feeds the recipient's relationship is unknown, so hide them entirely.
          const showStatusAction = !feed.isShared && canEditMembers;
          return renderMemberRow({
            feedId: feed.id,
            member,
            messageButtonHtml: showMessagingButtons ? renderMessageButton(feed.id, member, canMessage) : '',
            statusActionHtml: showStatusAction ? renderMemberStatusAction(feed.id, member, status) : '',
            canEdit: canEditMembers,
            showMeta: false,
          });
        })
        .join('')}
    </div>
  `;
}

export function renderFeedPreview(feedId: string, feedMembersById: Record<string, FeedMemberInfo[]>): string {
  const members = (feedMembersById[feedId] || []).slice(0, 3);
  if (members.length === 0) {
    return '';
  }

  return `
    <div class="lfa-feed-preview">
      ${members
        .map((member) =>
          member.itemType === 'search' || member.itemType === 'recruiterAggregate'
            ? `<div class="lfa-feed-preview-avatar lfa-feed-preview-avatar--search" aria-label="${escapeHtml(member.displayName)}">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" fill="currentColor"></circle>
                  <path d="M4.5 21a7.5 7.5 0 0 1 15 0" fill="currentColor"></path>
                </svg>
              </div>`
            : member.profileImageUrl
            ? `<img class="lfa-feed-preview-avatar" src="${escapeHtml(member.profileImageUrl)}" alt="${escapeHtml(member.displayName)}" data-lfa-avatar-img="true" /><div class="lfa-feed-preview-avatar lfa-feed-preview-avatar--fallback" style="display:none;">${escapeHtml(getMemberInitials(member.displayName))}</div>`
            : `<div class="lfa-feed-preview-avatar lfa-feed-preview-avatar--fallback">${escapeHtml(getMemberInitials(member.displayName))}</div>`
        )
        .join('')}
    </div>
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
