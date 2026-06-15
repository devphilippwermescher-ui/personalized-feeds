import { createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { dispatchFeedMemberAdded } from '../sync-events';
import type { FeedInfo, FeedMemberInfo } from '../types';
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
import type { FeedActionDeps } from './feed-action-types';

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
