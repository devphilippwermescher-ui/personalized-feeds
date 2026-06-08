import type { FeedInfo, FeedMemberInfo, MemberEditorState } from '../types';
import { getMemberInitials, getMemberStatus } from '../utils';
import { renderFeedActions } from './feed-actions';
import { renderMemberRow } from '../components/MemberRow/MemberRow';
import { renderMemberStatusAction, renderMessageButton } from './member-actions';
import { CONTENT_COPY } from '../../shared/copy';

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

function startBackgroundStatusRefresh(feedId: string, members: FeedMemberInfo[], deps: FeedMembersDeps): void {
  deps.getStatusFetchController()?.abort();
  const controller = new AbortController();
  deps.setStatusFetchController(controller);

  void deps.fetchStatusesProgressively(
    members,
    (member) => {
      void deps.persistResolvedMemberState(feedId, member);
      if (!deps.updateRenderedMemberState(feedId, member)) {
        deps.renderSidebarContent();
      }
    },
    controller.signal
  ).finally(() => {
    if (deps.getStatusFetchController() === controller) {
      deps.setStatusFetchController(null);
    }
  });
}

export async function loadFeedMembers(feedId: string, deps: FeedMembersDeps): Promise<void> {
  deps.setLoadingMembersFeedId(feedId);
  deps.renderSidebarContent();

  const feed = deps.getFeeds().find((item) => item.id === feedId);
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
  let membersForRefresh = cachedMembers;
  if (!feed?.isShared && cachedMembers.length > 0) {
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
  if (!feed?.isShared) {
    startBackgroundStatusRefresh(feedId, membersForRefresh, deps);
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
  const showMessagingButtons = deps.getMessagingButtonsEnabled();

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
          const canMessage = status === 'loading' ? false : (member.canMessage ?? status === 'connected');
          // Relationship badges reflect the owner's connection context.
          // In shared feeds the recipient's relationship is unknown, so hide them entirely.
          const showStatusAction = !feed.isShared && canEditMembers;
          return renderMemberRow({
            feedId: feed.id,
            member,
            messageButtonHtml: showMessagingButtons ? renderMessageButton(feed.id, member, canMessage) : '',
            statusActionHtml: showStatusAction ? renderMemberStatusAction(feed.id, member, status) : '',
            canEdit: canEditMembers,
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
          member.profileImageUrl
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
