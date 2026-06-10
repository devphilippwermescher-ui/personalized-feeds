import type { FeedInfo, MemberEditorState, UserInfo } from '../types';
import type { UserFeatureSettings } from 'shared/types';
import { renderMemberEditorOverlay } from '../components/MemberEditor/MemberEditor';
import { renderFeedRow } from '../components/FeedRow/FeedRow';

export interface SidebarDomSnapshot {
  feedListScrollTop: number;
  memberEditorScrollTop: number;
  searchQuery: string;
}

interface RenderSidebarInnerParams {
  container: HTMLElement;
  currentUser: UserInfo | null;
  featureSettings: UserFeatureSettings;
  feedsList: FeedInfo[];
  sharedFeedsList: FeedInfo[];
  sidebarSearchQuery: string;
  activeFeedTab: 'owned' | 'shared';
  expandedFeedId: string | null;
  activeMemberEditor: MemberEditorState | null;
  renderSidebarHeader: (params: {
    logoUrl: string;
    currentUser: UserInfo | null;
    isPremium: boolean;
    featureSettings: UserFeatureSettings;
  }) => string;
  renderSidebarBody: (params: {
    isLoading: boolean;
    isInitializing: boolean;
    isPremium: boolean;
    currentUser: UserInfo | null;
    authErrorMessage: string;
    sidebarSearchQuery: string;
    activeFeedTab: 'owned' | 'shared';
    feedsListCount: number;
    feedsHtml: string;
    editorOverlayHtml: string;
  }) => string;
  renderFeedPreview: (feedId: string) => string;
  renderMembersList: (feed: FeedInfo) => string;
  isLoading: boolean;
  isInitializing: boolean;
  isPremium: boolean;
  authErrorMessage: string;
  getLogoUrl: () => string;
}

export function captureSidebarDomSnapshot(
  container: HTMLElement,
  previous: Pick<SidebarDomSnapshot, 'feedListScrollTop' | 'memberEditorScrollTop' | 'searchQuery'>
): SidebarDomSnapshot {
  const feedList = container.querySelector<HTMLElement>('#lfa-feed-list');
  const editorBody = container.querySelector<HTMLElement>('.lfa-member-editor-body');
  const searchInput = container.querySelector<HTMLInputElement>('#lfa-search');

  return {
    feedListScrollTop: feedList ? feedList.scrollTop : previous.feedListScrollTop,
    memberEditorScrollTop: editorBody ? editorBody.scrollTop : previous.memberEditorScrollTop,
    searchQuery: searchInput ? searchInput.value : previous.searchQuery,
  };
}

export function restoreSidebarDomSnapshot(
  container: HTMLElement,
  snapshot: SidebarDomSnapshot,
  onRestore?: (snapshot: SidebarDomSnapshot) => void
): void {
  requestAnimationFrame(() => {
    const feedList = container.querySelector<HTMLElement>('#lfa-feed-list');
    const editorBody = container.querySelector<HTMLElement>('.lfa-member-editor-body');
    const searchInput = container.querySelector<HTMLInputElement>('#lfa-search');

    if (searchInput) {
      searchInput.value = snapshot.searchQuery;
    }

    if (feedList) {
      feedList.scrollTop = snapshot.feedListScrollTop;
    }

    if (editorBody) {
      editorBody.scrollTop = snapshot.memberEditorScrollTop;
    }

    onRestore?.(snapshot);
  });
}

export function renderEditorOverlay(activeMemberEditor: MemberEditorState | null, feedsList: FeedInfo[]): string {
  return renderMemberEditorOverlay(activeMemberEditor, feedsList);
}

export function renderSidebarInnerMarkup(params: RenderSidebarInnerParams): void {
  const {
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
    renderFeedPreview,
    renderMembersList,
    isLoading,
    isInitializing,
    isPremium,
    authErrorMessage,
    getLogoUrl,
  } = params;

  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'lfa-sidebar-header';
  header.innerHTML = renderSidebarHeader({
    logoUrl: getLogoUrl(),
    currentUser,
    isPremium,
    featureSettings,
  });
  container.appendChild(header);

  const content = document.createElement('div');
  content.className = 'lfa-sidebar-content';
  const sourceFeeds = activeFeedTab === 'owned' ? feedsList : sharedFeedsList;
  const visibleFeeds = sidebarSearchQuery
    ? sourceFeeds.filter((feed) => feed.name.toLowerCase().includes(sidebarSearchQuery.toLowerCase()))
    : sourceFeeds;

  const feedsHtml = visibleFeeds
    .map((feed) =>
      renderFeedRow({
        feed,
        expanded: expandedFeedId === feed.id,
        previewHtml: renderFeedPreview(feed.id),
        expandedContentHtml: expandedFeedId === feed.id ? renderMembersList(feed) : '',
      })
    )
    .join('');

  content.innerHTML = renderSidebarBody({
    isLoading,
    isInitializing,
    isPremium,
    currentUser,
    authErrorMessage,
    sidebarSearchQuery,
    activeFeedTab,
    feedsListCount: sourceFeeds.length,
    feedsHtml,
    editorOverlayHtml: renderEditorOverlay(activeMemberEditor, [...feedsList, ...sharedFeedsList].filter((feed) => !feed.isSystem)),
  });

  container.appendChild(content);
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function getLogoUrl(): string {
  return chrome.runtime.getURL('icons/icon48.png');
}
