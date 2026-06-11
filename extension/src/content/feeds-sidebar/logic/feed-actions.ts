import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { dispatchFeedMemberAdded } from '../sync-events';
import type { FeedInfo, FeedMemberInfo } from '../types';
import { renderLfsIconButton } from '../../../shared/ui';
import {
  feedCopiedMessage,
  feedDeletedMessage,
  profileAlreadyInFeedMessage,
  feedSharedMessage,
  feedUnfollowedMessage,
  feedUpdatedMessage,
  multipleProfilesAddedMessage,
} from '../../shared/toast-messages';
import {
  AddPeopleModal,
  ConfirmDuplicateModal,
  DeleteFeedModal,
  EditFeedModal,
  ShareFeedModal,
  SharedFeedFollowedModal,
  type LinkedInTypeaheadPerson,
} from '../../shared/components/FeedActionModals/FeedActionModals';
import { enrichProfileDataForFeed } from '../../shared/enrich-profile-data';
import { searchLinkedInPeople, toLinkedInProfileData } from './linkedin-search';

interface FeedActionDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  renderSidebarContent: () => void;
  loadFeeds: () => Promise<void>;
  getFeeds: () => FeedInfo[];
  setFeeds: (feeds: FeedInfo[]) => void;
  getSharedFeeds: () => FeedInfo[];
  setSharedFeeds: (feeds: FeedInfo[]) => void;
  getExpandedFeedId: () => string | null;
  setExpandedFeedId: (feedId: string | null) => void;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  setFeedMembersById: (membersById: Record<string, FeedMemberInfo[]>) => void;
  getModalState: () => { el: HTMLElement | null; root: Root | null };
  setModalState: (state: { el: HTMLElement | null; root: Root | null }) => void;
}

function renderFeedActionIcon(
  action:
    | 'edit'
    | 'add'
    | 'share'
    | 'delete'
    | 'duplicate'
    | 'unfollow'
): string {
  if (action === 'edit') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
      </svg>
    `;
  }

  if (action === 'add') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M19 8v6"></path>
        <path d="M16 11h6"></path>
      </svg>
    `;
  }

  if (action === 'share') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="18" cy="5" r="3"></circle>
        <circle cx="6" cy="12" r="3"></circle>
        <circle cx="18" cy="19" r="3"></circle>
        <path d="M8.59 13.51 15.42 17.49"></path>
        <path d="M15.41 6.51 8.59 10.49"></path>
      </svg>
    `;
  }

  if (action === 'duplicate') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="11" height="11" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        <path d="M14.5 14.5v5"></path>
        <path d="M12 17h5"></path>
      </svg>
    `;
  }

  if (action === 'unfollow') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-1 14H6L5 6"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M9 6V4h6v2"></path>
    </svg>
  `;
}

export function renderFeedActions(feed: FeedInfo): string {
  if (feed.isSystem) {
    return '';
  }

  const actions: Array<{
    key: 'edit' | 'add' | 'share' | 'delete' | 'duplicate' | 'unfollow';
    title: string;
    disabled?: boolean;
    danger?: boolean;
  }> = feed.isShared
    ? [
        ...(feed.accessRole === 'editor' ? [{ key: 'add' as const, title: 'Add people' }] : []),
        { key: 'duplicate', title: 'Duplicate feed' },
        { key: 'unfollow', title: 'Unfollow feed', danger: true },
      ]
    : [
        { key: 'edit', title: 'Edit feed' },
        { key: 'add', title: 'Add people' },
        { key: 'share', title: 'Share feed' },
        { key: 'delete', title: 'Delete feed', danger: true },
      ];

  return `
    <div class="lfa-feed-actions">
      ${actions
        .map((action) =>
          renderLfsIconButton({
            iconHtml: renderFeedActionIcon(action.key),
            title: action.title,
            variant: action.danger ? 'danger' : 'default',
            disabled: action.disabled,
            dataAttributes: {
              'feed-action': action.key,
              'feed-id': feed.id,
            },
          })
        )
        .join('')}
    </div>
  `;
}

export async function createNewFeed(
  name: string,
  deps: Pick<FeedActionDeps, 'getFeeds' | 'setFeeds' | 'sendMsg' | 'showToast' | 'loadFeeds' | 'renderSidebarContent'>
): Promise<boolean> {
  const { getFeeds, setFeeds, sendMsg, showToast, loadFeeds, renderSidebarContent } = deps;
  const colors = ['#615DEC', '#E74C3C', '#27AE60', '#F39C12', '#3498DB', '#9B59B6'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const previousFeeds = [...getFeeds()];
  const normalizedName = name.trim();

  if (!normalizedName) {
    showToast('Feed name is required', 'error');
    return false;
  }

  const duplicateExists = getFeeds().some((feed) => feed.name.trim().toLowerCase() === normalizedName.toLowerCase());
  if (duplicateExists) {
    showToast('A feed with this name already exists. Please enter another name.', 'error');
    return false;
  }

  const response = await sendMsg({ type: 'FEEDS_CREATE', name: normalizedName, description: '', color });

  if (!response?.success) {
    showToast((response?.error as string) || 'Failed to create feed', 'error');
    return false;
  }

  const createdFeed = response.feed as FeedInfo | undefined;
  if (createdFeed) {
    const alreadyExists = getFeeds().some((feed) => feed.id === createdFeed.id);
    if (!alreadyExists) {
      setFeeds([createdFeed, ...getFeeds()]);
    }
  }

  try {
    await loadFeeds();
  } catch {
    setFeeds(
      createdFeed
        ? [createdFeed, ...previousFeeds.filter((feed) => feed.id !== createdFeed.id)]
        : previousFeeds
    );
  }

  renderSidebarContent();
  return true;
}

export async function moveFeed(
  dragFeedId: string,
  targetFeedId: string,
  deps: Pick<FeedActionDeps, 'getFeeds' | 'setFeeds' | 'sendMsg' | 'showToast' | 'renderSidebarContent'>
): Promise<void> {
  const { getFeeds, setFeeds, sendMsg, showToast, renderSidebarContent } = deps;
  if (dragFeedId === targetFeedId) {
    return;
  }

  const currentFeeds = getFeeds();
  const fromIndex = currentFeeds.findIndex((feed) => feed.id === dragFeedId);
  const toIndex = currentFeeds.findIndex((feed) => feed.id === targetFeedId);

  if (fromIndex < 0 || toIndex < 0) {
    return;
  }

  if (currentFeeds[fromIndex]?.isSystem || currentFeeds[toIndex]?.isSystem) {
    return;
  }

  const previousFeeds = [...currentFeeds];
  const reorderedFeeds = [...currentFeeds];
  const [movedFeed] = reorderedFeeds.splice(fromIndex, 1);
  reorderedFeeds.splice(toIndex, 0, movedFeed);
  let manualSortOrder = 0;
  setFeeds(
    reorderedFeeds.map((feed) => {
      if (feed.isSystem) {
        return feed;
      }

      const nextFeed = {
        ...feed,
        sortOrder: manualSortOrder,
      };
      manualSortOrder += 1;
      return nextFeed;
    })
  );
  renderSidebarContent();

  const response = await sendMsg({
    type: 'FEEDS_REORDER',
    feedIds: reorderedFeeds.filter((feed) => !feed.isSystem).map((feed) => feed.id),
  });

  if (!response?.success) {
    setFeeds(previousFeeds);
    renderSidebarContent();
    showToast((response?.error as string) || 'Failed to reorder feeds', 'error');
  }
}

export function closeFeedActionModal(
  deps: Pick<FeedActionDeps, 'getModalState' | 'setModalState'>
): void {
  const { el, root } = deps.getModalState();
  root?.unmount();
  el?.remove();
  deps.setModalState({ el: null, root: null });
}

export function openFeedActionModal(
  element: ReactElement,
  deps: Pick<FeedActionDeps, 'getModalState' | 'setModalState'>
): void {
  closeFeedActionModal(deps);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(element);
  deps.setModalState({ el: container, root });
}

export function showEditFeedModal(feed: FeedInfo, deps: FeedActionDeps): void {
  openFeedActionModal(
    createElement(EditFeedModal, {
      feedName: feed.name,
      existingFeedNames: deps.getFeeds().filter((item) => item.id !== feed.id).map((item) => item.name),
      onClose: () => closeFeedActionModal(deps),
      onSave: async (nextName: string) => {
        if (!nextName) {
          deps.showToast('Feed name is required', 'error');
          return { success: false, error: 'Feed name is required' };
        }

        const response = await deps.sendMsg({
          type: 'FEEDS_UPDATE',
          feedId: feed.id,
          updates: { name: nextName },
        });

        if (!response?.success) {
          const error = (response?.error as string) || 'Failed to update feed';
          deps.showToast(error, 'error');
          return { success: false, error };
        }

        deps.setFeeds(deps.getFeeds().map((item) => (item.id === feed.id ? { ...item, name: nextName } : item)));
        deps.renderSidebarContent();
        closeFeedActionModal(deps);
        deps.showToast(feedUpdatedMessage(), 'success');
        return { success: true };
      },
    }),
    deps
  );
}

export function showAddPeopleModal(feed: FeedInfo, deps: FeedActionDeps): void {
  openFeedActionModal(
    createElement(AddPeopleModal, {
      feedName: feed.name,
      onClose: () => closeFeedActionModal(deps),
      onSearch: searchLinkedInPeople,
      onAddPeople: async (people: LinkedInTypeaheadPerson[]) => {
        let addedCount = 0;
        let duplicateCount = 0;

        for (const person of people) {
          const enrichedProfileData = await enrichProfileDataForFeed(toLinkedInProfileData(person));
          const result = (await deps.sendMsg({
            type: 'FEEDS_ADD_MEMBER',
            ownerId: feed.ownerId,
            feedId: feed.id,
            profileData: enrichedProfileData,
          })) as { success?: boolean; member?: FeedMemberInfo; alreadyExists?: boolean; error?: string };

          if (result?.success && result.alreadyExists) {
            duplicateCount += 1;
            continue;
          }

          if (result?.success && result.member) {
            dispatchFeedMemberAdded({
              feedId: feed.id,
              feedName: feed.name,
              member: result.member,
            });
            addedCount += 1;
          }
        }

        if (addedCount > 0) {
          deps.showToast(multipleProfilesAddedMessage(addedCount, feed.name), 'success');
          return { success: true };
        }

        if (duplicateCount > 0) {
          const duplicateMessage =
            people.length === 1
              ? profileAlreadyInFeedMessage(people[0].displayName, feed.name)
              : `${duplicateCount} selected profile${duplicateCount === 1 ? '' : 's'} already exist in "${feed.name}"`;
          deps.showToast(duplicateMessage, 'error');
          return { success: false };
        }

        deps.showToast('No profiles were added', 'error');
        return { success: false };
      },
    }),
    deps
  );
}

export function showShareFeedModal(feed: FeedInfo, deps: FeedActionDeps): void {
  openFeedActionModal(
    createElement(ShareFeedModal, {
      onClose: () => closeFeedActionModal(deps),
      onLoadShares: async () => {
        const response = await deps.sendMsg({
          type: 'FEEDS_GET_SHARES',
          feedId: feed.id,
        });

        return (response?.shares as Array<{
          targetUid: string;
          targetEmail: string;
          displayName: string;
          photoURL?: string;
          role: 'reader' | 'editor';
        }>) || [];
      },
      onShareByEmail: async (email: string, role: 'reader' | 'editor') => {
        const response = await deps.sendMsg({
          type: 'FEEDS_SHARE_WITH_EMAIL',
          feedId: feed.id,
          email,
          role,
        });

        if (!response?.success) {
          return { success: false, error: (response?.error as string) || 'Failed to share this feed' };
        }

        deps.showToast(feedSharedMessage(feed.name), 'success');
        return { success: true };
      },
      onUpdateShareRole: async (targetUid: string, role: 'reader' | 'editor') => {
        const response = await deps.sendMsg({
          type: 'FEEDS_UPDATE_SHARE_ROLE',
          feedId: feed.id,
          targetUid,
          role,
        });

        if (!response?.success) {
          return { success: false, error: (response?.error as string) || 'Failed to update access role' };
        }

        deps.showToast('Access updated', 'success');
        return { success: true };
      },
      onRemoveShare: async (targetUid: string) => {
        const response = await deps.sendMsg({
          type: 'FEEDS_REMOVE_SHARE',
          feedId: feed.id,
          targetUid,
        });

        if (!response?.success) {
          return { success: false, error: (response?.error as string) || 'Failed to remove shared user' };
        }

        deps.showToast('Access removed', 'success');
        return { success: true };
      },
      onGetLink: async () => {
        const response = await deps.sendMsg({
          type: 'FEEDS_GET_SHARE_LINK',
          feedId: feed.id,
        });

        if (!response?.success) {
          return { success: false, error: (response?.error as string) || 'Failed to generate link' };
        }

        return { success: true, url: response.url as string };
      },
    }),
    deps
  );
}

export function showDuplicateSharedFeedModal(feed: FeedInfo, deps: FeedActionDeps): void {
  openFeedActionModal(
    createElement(ConfirmDuplicateModal, {
      onClose: () => closeFeedActionModal(deps),
      onConfirm: async () => {
        const response = await deps.sendMsg({
          type: 'FEEDS_DUPLICATE_SHARED',
          ownerId: feed.ownerId,
          feedId: feed.id,
        });

        if (!response?.success) {
          deps.showToast((response?.error as string) || 'Failed to duplicate shared feed', 'error');
          return;
        }

        await deps.loadFeeds();
        deps.renderSidebarContent();
        closeFeedActionModal(deps);
        deps.showToast(feedCopiedMessage(feed.name), 'success');
      },
    }),
    deps
  );
}

export async function unfollowSharedFeed(feed: FeedInfo, deps: FeedActionDeps): Promise<void> {
  const response = await deps.sendMsg({
    type: 'FEEDS_UNFOLLOW_SHARED',
    ownerId: feed.ownerId,
    feedId: feed.id,
  });

  if (!response?.success) {
    deps.showToast((response?.error as string) || 'Failed to unfollow feed', 'error');
    return;
  }

  deps.setSharedFeeds(deps.getSharedFeeds().filter((item) => !(item.id === feed.id && item.ownerId === feed.ownerId)));
  if (deps.getExpandedFeedId() === feed.id) {
    deps.setExpandedFeedId(null);
  }
  deps.renderSidebarContent();
  deps.showToast(feedUnfollowedMessage(feed.name), 'success');
}

export function showSharedFeedFollowedModal(feedName: string, ownerName: string, deps: FeedActionDeps): void {
  openFeedActionModal(
    createElement(SharedFeedFollowedModal, {
      feedName,
      ownerName,
      onClose: () => closeFeedActionModal(deps),
      onViewSharedFeeds: () => {
        closeFeedActionModal(deps);
        deps.renderSidebarContent();
        document.getElementById('lfa-tab-shared')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      },
    }),
    deps
  );
}

export async function deleteFeedAction(feed: FeedInfo, deps: FeedActionDeps): Promise<void> {
  openFeedActionModal(
    createElement(DeleteFeedModal, {
      feedName: feed.name,
      memberCount: deps.getFeedMembersById()[feed.id]?.length ?? feed.memberCount ?? 0,
      onClose: () => closeFeedActionModal(deps),
      onDelete: async () => {
        const previousFeeds = [...deps.getFeeds()];
        const previousExpandedFeedId = deps.getExpandedFeedId();
        const previousFeedMembersById = deps.getFeedMembersById();

        deps.setFeeds(previousFeeds.filter((item) => item.id !== feed.id));

        if (previousExpandedFeedId === feed.id) {
          deps.setExpandedFeedId(null);
        }

        const nextFeedMembersById = { ...previousFeedMembersById };
        delete nextFeedMembersById[feed.id];
        deps.setFeedMembersById(nextFeedMembersById);
        deps.renderSidebarContent();

        const response = await deps.sendMsg({ type: 'FEEDS_DELETE', feedId: feed.id });

        if (!response?.success) {
          deps.setFeeds(previousFeeds);
          deps.setExpandedFeedId(previousExpandedFeedId);
          deps.setFeedMembersById(previousFeedMembersById);
          deps.renderSidebarContent();
          const error = (response?.error as string) || 'Failed to delete feed';
          deps.showToast(error, 'error');
          return { success: false, error };
        }

        try {
          await deps.loadFeeds();
        } catch {
          deps.setFeeds(previousFeeds.filter((item) => item.id !== feed.id));
        }

        deps.renderSidebarContent();
        deps.showToast(feedDeletedMessage(feed.name), 'success');
        return { success: true };
      },
    }),
    deps
  );
}
