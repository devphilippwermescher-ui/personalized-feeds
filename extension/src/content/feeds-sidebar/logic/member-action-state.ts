import type { FeedInfo, FeedMemberInfo } from '../types';
import { canMemberReceiveMessage, getMemberStatus } from '../utils';
import {
  profileMovedToFeedMessage,
  profileRemovedFromFeedMessage,
  profileUpdatedMessage,
} from '../../shared/toast-messages';
import type { MemberActionDeps } from './member-action-types';
import {
  bindAvatarFallbacks,
  bindMemberActionButtons,
  renderMemberAvatar,
  renderMemberStatusAction,
  renderMessageButton,
} from './member-action-render';
import { escapeHtml } from './escape-html';

function replaceFeedMembers(
  current: Record<string, FeedMemberInfo[]>,
  feedId: string,
  updater: (members: FeedMemberInfo[]) => FeedMemberInfo[]
): Record<string, FeedMemberInfo[]> {
  return {
    ...current,
    [feedId]: updater(current[feedId] || []),
  };
}

function isProfileViewersFeed(feed?: FeedInfo): boolean {
  return feed?.systemType === 'profileViewers';
}

export function updateRenderedMemberState(
  sidebarEl: HTMLElement | null,
  feedId: string,
  member: FeedMemberInfo,
  deps: Pick<MemberActionDeps, 'openLinkedInMessage' | 'openLinkedInProfile' | 'fetchLinkedInRelationshipStatus' | 'resolveProfileUrn' | 'sendLinkedInConnectRequest' | 'sendLinkedInFollowState' | 'invalidateCacheForUser' | 'getFeedMembersById' | 'showToast' | 'renderSidebarContent' | 'getMessagingButtonsEnabled'>
): boolean {
  const row = sidebarEl?.querySelector<HTMLElement>(
    `.lfa-member-row[data-feed-id="${CSS.escape(feedId)}"][data-member-id="${CSS.escape(member.id)}"]`
  );

  if (!row) {
    return false;
  }

  const status = getMemberStatus(member);
  const canMessage = canMemberReceiveMessage(member, status);
  const showMessagingButtons = deps.getMessagingButtonsEnabled?.() ?? true;
  const actions = row.querySelector('.lfa-member-actions');
  const currentMessageButton = row.querySelector('[data-member-action="message"]');
  const currentStatusNode = row.querySelector('.lfa-member-status');

  if (currentMessageButton && showMessagingButtons) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMessageButton(feedId, member, canMessage).trim();
    const nextButton = wrapper.firstElementChild as HTMLElement | null;
    if (nextButton) {
      currentMessageButton.replaceWith(nextButton);
      bindMemberActionButtons(actions || row, deps as MemberActionDeps);
    }
  } else if (currentMessageButton && !showMessagingButtons) {
    currentMessageButton.remove();
  }

  if (currentStatusNode) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMemberStatusAction(feedId, member, status).trim();
    const nextStatusNode = wrapper.firstElementChild as HTMLElement | null;
    if (nextStatusNode) {
      currentStatusNode.replaceWith(nextStatusNode);
      bindMemberActionButtons(actions || row, deps as MemberActionDeps);
    }
  }

  // Update premium icon inside the member name button.
  // This is the only place that reflects isPremium after an in-place status refresh —
  // the name button is not part of the message or status node swaps above.
  const nameButton = row.querySelector<HTMLElement>('.lfa-member-name');
  if (nameButton) {
    const escapedName = escapeHtml(member.displayName);
    const premiumIconHtml = member.isPremium
      ? ' <span class="lfa-member-premium-icon" title="LinkedIn Premium" aria-label="LinkedIn Premium">✦</span>'
      : '';
    nameButton.innerHTML = `<span class="lfa-member-name-text">${escapedName}</span>${premiumIconHtml}`;
  }

  const memberMain = row.querySelector<HTMLElement>('.lfa-member-main');
  const memberInfo = memberMain?.querySelector<HTMLElement>('.lfa-member-info');
  if (memberMain && memberInfo) {
    Array.from(memberMain.children).forEach((child) => {
      if (child instanceof HTMLElement && child.classList.contains('lfa-member-avatar')) {
        child.remove();
      }
    });

    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMemberAvatar(member).trim();
    const nextAvatarNodes = Array.from(wrapper.children) as HTMLElement[];
    nextAvatarNodes.forEach((node) => {
      memberMain.insertBefore(node, memberInfo);
    });
    bindAvatarFallbacks(memberMain);
  }

  return true;
}

export async function persistResolvedMemberState(
  feedId: string,
  member: FeedMemberInfo,
  deps: Pick<MemberActionDeps, 'sendMsg' | 'getFeeds'>
): Promise<void> {
  if (!member.id || !member.status || member.status === 'loading') {
    return;
  }

  const updates: Partial<FeedMemberInfo> = {
    status: member.status,
  };

  if (member.status === 'connected') {
    member.canMessage = true;
  }

  if (member.profileUrn) {
    updates.profileUrn = member.profileUrn;
  }

  if (member.memberNumericId) {
    updates.memberNumericId = member.memberNumericId;
  }

  if (typeof member.canMessage === 'boolean') {
    updates.canMessage = member.canMessage;
  }

  if (typeof member.canFollow === 'boolean') {
    updates.canFollow = member.canFollow;
  }

  if (typeof member.canConnect === 'boolean') {
    updates.canConnect = member.canConnect;
  }

  if (typeof member.isFollowing === 'boolean') {
    updates.isFollowing = member.isFollowing;
  }

  if (member.profileImageUrl) {
    updates.profileImageUrl = member.profileImageUrl;
  }

  // Always write isPremium after a full GraphQL/HTML status resolution.
  // Writing false when not detected ensures a stale `true` from a prior Premium
  // session is cleared — the GraphQL path is the authoritative source for this flag.
  updates.isPremium = member.isPremium === true;

  if (member.status === 'connected') {
    updates.connectionDegree = '1st';
  } else if (
    member.status === 'pending' ||
    member.status === 'connect' ||
    member.status === 'following' ||
    member.status === 'withdrawn' ||
    member.status === 'unavailable'
  ) {
    updates.connectionDegree = '';
  }

  const feed = deps.getFeeds().find((item) => item.id === feedId);
  if (isProfileViewersFeed(feed)) {
    await deps.sendMsg({
      type: 'PROFILE_VIEWERS_UPDATE',
      viewerId: member.id,
      updates,
    });
    return;
  }

  await deps.sendMsg({
    type: 'FEEDS_UPDATE_MEMBER',
    ownerId: feed?.ownerId,
    feedId,
    memberId: member.id,
    updates,
  });
}

export async function handleMemberDelete(
  feedId: string,
  memberId: string,
  deps: Pick<MemberActionDeps, 'sendMsg' | 'showToast' | 'getFeedMembersById' | 'setFeedMembersById' | 'getActiveMemberEditor' | 'setActiveMemberEditor' | 'loadFeeds' | 'renderSidebarContent' | 'getFeeds'>
): Promise<void> {
  const feed = deps.getFeeds().find((item) => item.id === feedId);
  const result = await deps.sendMsg(
    isProfileViewersFeed(feed)
      ? {
          type: 'PROFILE_VIEWERS_REMOVE',
          viewerId: memberId,
        }
      : {
          type: 'FEEDS_REMOVE_MEMBER',
          ownerId: feed?.ownerId,
          feedId,
          memberId,
        }
  );

  if (!result?.success) {
    deps.showToast((result?.error as string) || 'Failed to remove profile from feed', 'error');
    return;
  }

  deps.setFeedMembersById(
    replaceFeedMembers(deps.getFeedMembersById(), feedId, (members) => members.filter((member) => member.id !== memberId))
  );

  if (deps.getActiveMemberEditor()?.member.id === memberId) {
    deps.setActiveMemberEditor(null);
  }

  await deps.loadFeeds();
  deps.renderSidebarContent();
  deps.showToast(profileRemovedFromFeedMessage(), 'success');
}

export async function handleMemberSave(
  deps: Pick<MemberActionDeps, 'sendMsg' | 'showToast' | 'getActiveMemberEditor' | 'setActiveMemberEditor' | 'getFeedMembersById' | 'setFeedMembersById' | 'loadFeeds' | 'renderSidebarContent' | 'setExpandedFeedId' | 'loadFeedMembers' | 'getFeeds'>
): Promise<void> {
  const editorState = deps.getActiveMemberEditor();
  if (!editorState) {
    return;
  }

  const displayName = (document.getElementById('lfa-member-edit-name') as HTMLInputElement | null)?.value?.trim();
  const headline = (document.getElementById('lfa-member-edit-headline') as HTMLInputElement | null)?.value?.trim() || '';
  const email = (document.getElementById('lfa-member-edit-email') as HTMLInputElement | null)?.value?.trim() || '';
  const company = (document.getElementById('lfa-member-edit-company') as HTMLInputElement | null)?.value?.trim() || '';
  const location = (document.getElementById('lfa-member-edit-location') as HTMLInputElement | null)?.value?.trim() || '';
  const linkedinUrl = (document.getElementById('lfa-member-edit-url') as HTMLInputElement | null)?.value?.trim() || '';
  const selectedFeedId = (document.getElementById('lfa-member-edit-feed') as HTMLInputElement | null)?.value || editorState.feedId;
  const currentFeed = deps.getFeeds().find((feed) => feed.id === editorState.feedId);

  const updates = {
    displayName: displayName || editorState.member.displayName,
    headline,
    email,
    company,
    location,
    linkedinUrl,
  };

  if (selectedFeedId !== editorState.feedId) {
    const addResult = await deps.sendMsg({
      type: 'FEEDS_ADD_MEMBER',
      ownerId: deps.getFeeds().find((feed) => feed.id === selectedFeedId)?.ownerId,
      feedId: selectedFeedId,
      profileData: {
        ...editorState.member,
        ...updates,
        linkedinUrl: updates.linkedinUrl,
        displayName: updates.displayName,
        headline: updates.headline,
        company: updates.company,
        location: updates.location,
        email: updates.email,
      },
    });

    if (!addResult?.success || !addResult.member) {
      deps.showToast((addResult?.error as string) || 'Failed to move profile to another feed', 'error');
      return;
    }

    if (addResult.alreadyExists) {
      deps.showToast('This profile is already in the selected feed', 'error');
      return;
    }

    const createdMember = addResult.member as FeedMemberInfo;
    const syncResult = await deps.sendMsg({
      type: 'FEEDS_UPDATE_MEMBER',
      ownerId: deps.getFeeds().find((feed) => feed.id === selectedFeedId)?.ownerId,
      feedId: selectedFeedId,
      memberId: createdMember.id,
      updates,
    });

    if (!syncResult?.success) {
      deps.showToast((syncResult?.error as string) || 'Failed to update moved profile', 'error');
      return;
    }

    const removeResult = await deps.sendMsg(
      isProfileViewersFeed(currentFeed)
        ? {
            type: 'PROFILE_VIEWERS_REMOVE',
            viewerId: editorState.member.id,
          }
        : {
            type: 'FEEDS_REMOVE_MEMBER',
            ownerId: currentFeed?.ownerId,
            feedId: editorState.feedId,
            memberId: editorState.member.id,
          }
    );

    if (!removeResult?.success) {
      deps.showToast((removeResult?.error as string) || 'Profile was copied but not removed from previous feed', 'error');
      return;
    }

    const nextFeedMembers = { ...deps.getFeedMembersById() };
    delete nextFeedMembers[editorState.feedId];
    delete nextFeedMembers[selectedFeedId];
    deps.setFeedMembersById(nextFeedMembers);
    deps.setActiveMemberEditor(null);
    deps.setExpandedFeedId?.(selectedFeedId);
    await deps.loadFeeds();
    if (deps.loadFeedMembers) {
      await deps.loadFeedMembers(selectedFeedId);
    }
    deps.showToast(profileMovedToFeedMessage(), 'success');
    return;
  }

  const result = await deps.sendMsg(
    isProfileViewersFeed(currentFeed)
      ? {
          type: 'PROFILE_VIEWERS_UPDATE',
          viewerId: editorState.member.id,
          updates,
        }
      : {
          type: 'FEEDS_UPDATE_MEMBER',
          ownerId: currentFeed?.ownerId,
          feedId: editorState.feedId,
          memberId: editorState.member.id,
          updates,
        }
  );

  if (!result?.success) {
    deps.showToast((result?.error as string) || 'Failed to save profile changes', 'error');
    return;
  }

  deps.setFeedMembersById(
    replaceFeedMembers(deps.getFeedMembersById(), editorState.feedId, (members) =>
      members.map((member) => (member.id === editorState.member.id ? { ...member, ...updates } : member))
    )
  );

  deps.setActiveMemberEditor(null);
  deps.renderSidebarContent();
  deps.showToast(profileUpdatedMessage(), 'success');
}
