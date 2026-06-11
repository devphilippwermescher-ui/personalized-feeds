import { bindLfsDropdowns } from '../../../shared/ui';
import type { FeedInfo, FeedMemberInfo, MemberEditorState } from '../types';
import type { UserFeatureSettings } from 'shared/types';
import { getFeedScrollContainer } from './feed-expansion-motion';
import { bindMemberActionButtons } from './member-actions';

interface SidebarDomBindingsDeps {
  toggleSidebar: () => void;
  handleSignIn: () => void;
  handleSignOut: () => void;
  showCreateFeedForm: () => void;
  selectFeedTab: (tab: 'owned' | 'shared') => void;
  openProfileSettings: () => void;
  openSubscription: () => void;
  updateFeatureSetting: (key: keyof UserFeatureSettings, value: boolean) => Promise<void>;
  renderSidebarContent: () => void;
  handleMemberSave: () => void;
  filterFeeds: (query: string) => void;
  toggleFeedExpansion: (feedId: string) => Promise<void>;
  openFeedPosts: (feedId: string) => Promise<void>;
  moveFeed: (sourceFeedId: string, targetFeedId: string) => Promise<void>;
  showEditFeedModal: (feed: FeedInfo) => void;
  showAddPeopleModal: (feed: FeedInfo) => void;
  showShareFeedModal: (feed: FeedInfo) => void;
  showDuplicateSharedFeedModal: (feed: FeedInfo) => void;
  unfollowSharedFeed: (feed: FeedInfo) => Promise<void>;
  deleteFeed: (feed: FeedInfo) => Promise<void>;
  handleMemberDelete: (feedId: string, memberId: string) => Promise<void>;
  openDashboard: () => void;
  getFeeds: () => FeedInfo[];
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  setActiveMemberEditor: (state: MemberEditorState | null) => void;
  getDraggedFeedId: () => string | null;
  setDraggedFeedId: (feedId: string | null) => void;
  setSettingsMenuOpen: (value: boolean) => void;
  setAccountMenuOpen: (value: boolean) => void;
  memberActionDeps: Parameters<typeof bindMemberActionButtons>[1];
  togglePlan: () => void;
}

export function bindSidebarDom(container: HTMLElement, deps: SidebarDomBindingsDeps): void {
  container.querySelector('#lfa-plan-toggle-btn')?.addEventListener('click', deps.togglePlan);
  container.querySelector('#lfa-open-popup-hint')?.addEventListener('click', (e) => e.preventDefault());
  container.querySelector('#lfa-open-dashboard-btn')?.addEventListener('click', deps.openDashboard);
  container.querySelector('#lfa-header-dashboard-btn')?.addEventListener('click', deps.openDashboard);
  container.querySelector('#lfa-toolbar-dashboard-btn')?.addEventListener('click', deps.openDashboard);
  container.querySelector('#lfa-open-subscription-btn')?.addEventListener('click', deps.openSubscription);
  container.querySelector('#lfa-open-subscription-activate')?.addEventListener('click', deps.openSubscription);
  container.querySelector('#lfa-signin-btn')?.addEventListener('click', deps.handleSignIn);
  container.querySelector('#lfa-account-signout-btn')?.addEventListener('click', deps.handleSignOut);
  container.querySelector('#lfa-add-feed-btn')?.addEventListener('click', deps.showCreateFeedForm);
  container.querySelector('#lfa-profile-settings-btn')?.addEventListener('click', deps.openProfileSettings);
  container.querySelector('#lfa-manage-account-btn')?.addEventListener('click', () => {
    container.querySelector('#lfa-settings-menu')?.classList.remove('lfa-settings-menu--open');
    deps.setSettingsMenuOpen(false);
    deps.openProfileSettings();
  });
  container.querySelector('#lfa-subscription-btn')?.addEventListener('click', deps.openSubscription);
  container.querySelector('#lfa-tab-owned')?.addEventListener('click', () => deps.selectFeedTab('owned'));
  container.querySelector('#lfa-tab-shared')?.addEventListener('click', () => deps.selectFeedTab('shared'));
  container.querySelector('#lfa-member-editor-back')?.addEventListener('click', () => {
    deps.setActiveMemberEditor(null);
    deps.renderSidebarContent();
  });
  container.querySelector('#lfa-member-editor-close')?.addEventListener('click', () => {
    deps.setActiveMemberEditor(null);
    deps.renderSidebarContent();
  });
  container.querySelector('#lfa-member-editor-save')?.addEventListener('click', deps.handleMemberSave);

  bindLfsDropdowns(container);

  const searchInput = container.querySelector('#lfa-search') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    deps.filterFeeds(searchInput.value);
  });

  bindFeedInteractions(container, deps);
  bindFeedActionButtons(container, deps);
  bindMemberActionButtons(container, deps.memberActionDeps);
  bindMemberEditorButtons(container, deps);
  bindFeedMembersScrollHandoff(container);
  bindSettingsMenu(container, deps);
  bindAccountMenu(container, deps);
}

let settingsMenuDocClickHandler: (() => void) | null = null;
let accountMenuDocClickHandler: (() => void) | null = null;

function bindSettingsMenu(container: HTMLElement, deps: SidebarDomBindingsDeps): void {
  const settingsBtn = container.querySelector<HTMLElement>('#lfa-settings-btn');
  const settingsMenu = container.querySelector<HTMLElement>('#lfa-settings-menu');

  settingsBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = settingsMenu?.classList.toggle('lfa-settings-menu--open') ?? false;
    deps.setSettingsMenuOpen(isOpen);
  });

  settingsMenu?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  container.querySelectorAll<HTMLElement>('[data-setting-toggle]').forEach((toggle) => {
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const key = toggle.getAttribute('data-setting-toggle') as keyof UserFeatureSettings | null;
      if (!key) {
        return;
      }

      const newValue = !toggle.classList.contains('active');
      toggle.classList.toggle('active', newValue);
      toggle.setAttribute('aria-pressed', String(newValue));
      void deps.updateFeatureSetting(key, newValue);
    });
  });

  if (settingsMenuDocClickHandler) {
    document.removeEventListener('click', settingsMenuDocClickHandler);
  }
  settingsMenuDocClickHandler = () => {
    settingsMenu?.classList.remove('lfa-settings-menu--open');
    deps.setSettingsMenuOpen(false);
  };
  document.addEventListener('click', settingsMenuDocClickHandler);
}

function bindAccountMenu(container: HTMLElement, deps: SidebarDomBindingsDeps): void {
  const accountBtn = container.querySelector<HTMLElement>('#lfa-account-btn');
  const accountMenu = container.querySelector<HTMLElement>('#lfa-account-menu');

  accountBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = accountMenu?.classList.toggle('lfa-account-menu--open') ?? false;
    deps.setAccountMenuOpen(isOpen);
  });

  accountMenu?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  if (accountMenuDocClickHandler) {
    document.removeEventListener('click', accountMenuDocClickHandler);
  }

  accountMenuDocClickHandler = () => {
    accountMenu?.classList.remove('lfa-account-menu--open');
    deps.setAccountMenuOpen(false);
  };

  document.addEventListener('click', accountMenuDocClickHandler);
}

function bindFeedMembersScrollHandoff(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('.lfa-feed-members-list').forEach((membersList) => {
    membersList.addEventListener(
      'wheel',
      (event) => {
        if (Math.abs(event.deltaY) < 1 || membersList.scrollHeight <= membersList.clientHeight) {
          return;
        }

        const feedList = getFeedScrollContainer(container);
        if (!feedList) {
          return;
        }

        const atTop = membersList.scrollTop <= 0;
        const atBottom = membersList.scrollTop + membersList.clientHeight >= membersList.scrollHeight - 1;
        const scrollingUp = event.deltaY < 0;
        const scrollingDown = event.deltaY > 0;
        const canScrollFeedListUp = feedList.scrollTop > 0;
        const canScrollFeedListDown = feedList.scrollTop + feedList.clientHeight < feedList.scrollHeight - 1;

        if ((scrollingUp && atTop && canScrollFeedListUp) || (scrollingDown && atBottom && canScrollFeedListDown)) {
          event.preventDefault();
          feedList.scrollTop += event.deltaY;
        }
      },
      { passive: false }
    );
  });
}

function bindFeedInteractions(container: HTMLElement, deps: SidebarDomBindingsDeps): void {
  const feedList = container.querySelector<HTMLElement>('#lfa-feed-list');
  if (feedList) {
    feedList.onclick = (event) => {
      const target = event.target as HTMLElement | null;
      const feedNameButton = target?.closest<HTMLElement>('.lfa-feed-name');
      if (!feedNameButton) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const feedItem = feedNameButton.closest<HTMLElement>('.lfa-feed-item');
      const feedId = feedItem?.getAttribute('data-feed-id');
      if (feedId) {
        void deps.openFeedPosts(feedId);
      }
    };
  }

  container.querySelectorAll<HTMLElement>('.lfa-feed-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      // Clicks on the feed-name button are handled by the feedList delegation above
      // (openFeedPosts). Skip expand/collapse so both don't fire.
      if ((event.target as HTMLElement | null)?.closest('.lfa-feed-name')) {
        return;
      }
      const feedId = item.getAttribute('data-feed-id');
      if (feedId) {
        void deps.toggleFeedExpansion(feedId);
      }
    });

    item.addEventListener('dragstart', (event) => {
      const feedId = item.getAttribute('data-feed-id');
      if (!feedId) {
        return;
      }

      deps.setDraggedFeedId(feedId);
      const dragEvent = event as DragEvent;
      dragEvent.dataTransfer?.setData('text/plain', feedId);
      if (dragEvent.dataTransfer) {
        dragEvent.dataTransfer.effectAllowed = 'move';
      }
      item.closest('.lfa-feed-group')?.classList.add('lfa-feed-group--dragging');
    });

    item.addEventListener('dragend', () => {
      deps.setDraggedFeedId(null);
      container.querySelectorAll('.lfa-feed-group').forEach((group) => {
        group.classList.remove('lfa-feed-group--dragging', 'lfa-feed-group--drop-target');
      });
    });

    item.addEventListener('dragover', (event) => {
      event.preventDefault();
      const currentFeedId = item.getAttribute('data-feed-id');
      const group = item.closest('.lfa-feed-group');
      if (!group || !deps.getDraggedFeedId() || deps.getDraggedFeedId() === currentFeedId) {
        return;
      }

      container.querySelectorAll('.lfa-feed-group--drop-target').forEach((el) => {
        if (el !== group) {
          el.classList.remove('lfa-feed-group--drop-target');
        }
      });
      group.classList.add('lfa-feed-group--drop-target');
    });

    item.addEventListener('dragleave', (event) => {
      const group = item.closest('.lfa-feed-group');
      const relatedTarget = (event as DragEvent).relatedTarget as Node | null;
      if (group && (!relatedTarget || !group.contains(relatedTarget))) {
        group.classList.remove('lfa-feed-group--drop-target');
      }
    });

    item.addEventListener('drop', (event) => {
      event.preventDefault();
      const targetFeedId = item.getAttribute('data-feed-id');
      const sourceFeedId = (event as DragEvent).dataTransfer?.getData('text/plain') || deps.getDraggedFeedId();
      item.closest('.lfa-feed-group')?.classList.remove('lfa-feed-group--drop-target');

      if (sourceFeedId && targetFeedId) {
        void deps.moveFeed(sourceFeedId, targetFeedId);
      }
    });
  });
}

function bindFeedActionButtons(container: HTMLElement, deps: SidebarDomBindingsDeps): void {
  container.querySelectorAll<HTMLElement>('[data-feed-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const feedId = button.getAttribute('data-feed-id');
      const action = button.getAttribute('data-feed-action');
      const feed = deps.getFeeds().find((item) => item.id === feedId);
      if (!feed || !action) {
        return;
      }

      if (action === 'edit') {
        deps.showEditFeedModal(feed);
        return;
      }

      if (action === 'add') {
        deps.showAddPeopleModal(feed);
        return;
      }

      if (action === 'share') {
        deps.showShareFeedModal(feed);
        return;
      }

      if (action === 'delete') {
        void deps.deleteFeed(feed);
        return;
      }

      if (action === 'duplicate') {
        deps.showDuplicateSharedFeedModal(feed);
        return;
      }

      if (action === 'unfollow') {
        void deps.unfollowSharedFeed(feed);
      }
    });
  });
}

function bindMemberEditorButtons(container: HTMLElement, deps: SidebarDomBindingsDeps): void {
  container.querySelectorAll('[data-member-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const memberId = (btn as HTMLElement).getAttribute('data-member-id');
      const feedId = (btn as HTMLElement).getAttribute('data-feed-id');
      if (!memberId || !feedId) return;

      const member = (deps.getFeedMembersById()[feedId] || []).find((item) => item.id === memberId);
      const feed = deps.getFeeds().find((item) => item.id === feedId);
      if (!member || !feed) return;

      deps.setActiveMemberEditor({
        feedId,
        feedName: feed.name,
        member: { ...member },
      });
      deps.renderSidebarContent();
    });
  });

  container.querySelectorAll('[data-member-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const memberId = (btn as HTMLElement).getAttribute('data-member-id');
      const feedId = (btn as HTMLElement).getAttribute('data-feed-id');
      if (!memberId || !feedId) return;

      await deps.handleMemberDelete(feedId, memberId);
    });
  });
}
