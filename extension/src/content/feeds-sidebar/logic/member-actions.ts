import type { FeedInfo, FeedMemberInfo, MemberEditorState } from '../types';
import { getMemberInitials, getMemberStatus, getMemberStatusMarkup, getMemberStatusTooltip } from '../utils';
import {
  connectRequestSentMessage,
  profileMovedToFeedMessage,
  profileRemovedFromFeedMessage,
  profileUpdatedMessage,
} from '../../shared/toast-messages';
import type { fetchLinkedInRelationshipStatus, invalidateCacheForUser, resolveProfileUrn, sendLinkedInConnectRequest, sendLinkedInFollowState } from '../../linkedin-relationship-status';

interface MemberActionDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  renderSidebarContent: () => void;
  openLinkedInMessage: (linkedinUrl: string, profileUrn?: string) => void;
  openLinkedInProfile: (linkedinUrl: string) => void;
  fetchLinkedInRelationshipStatus: typeof fetchLinkedInRelationshipStatus;
  resolveProfileUrn: typeof resolveProfileUrn;
  sendLinkedInConnectRequest: typeof sendLinkedInConnectRequest;
  sendLinkedInFollowState: typeof sendLinkedInFollowState;
  invalidateCacheForUser: typeof invalidateCacheForUser;
  getFeedMembersById: () => Record<string, FeedMemberInfo[]>;
  getMessagingButtonsEnabled?: () => boolean;
  setFeedMembersById: (value: Record<string, FeedMemberInfo[]>) => void;
  getFeeds: () => FeedInfo[];
  loadFeeds: () => Promise<void>;
  getActiveMemberEditor: () => MemberEditorState | null;
  setActiveMemberEditor: (value: MemberEditorState | null) => void;
  setExpandedFeedId?: (feedId: string | null) => void;
  loadFeedMembers?: (feedId: string) => Promise<void>;
}

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

function renderMemberAvatar(member: FeedMemberInfo): string {
  return member.profileImageUrl
    ? `<img class="lfa-member-avatar" src="${escapeHtml(member.profileImageUrl)}" alt="${escapeHtml(member.displayName)}" data-lfa-avatar-img="true" /><div class="lfa-member-avatar lfa-member-avatar--fallback" style="display:none;">${escapeHtml(getMemberInitials(member.displayName))}</div>`
    : `<div class="lfa-member-avatar lfa-member-avatar--fallback">${escapeHtml(getMemberInitials(member.displayName))}</div>`;
}

function bindAvatarFallbacks(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>('img[data-lfa-avatar-img="true"]').forEach((img) => {
    if (img.dataset.lfaBoundAvatarError === 'true') {
      return;
    }
    img.dataset.lfaBoundAvatarError = 'true';
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const fallback = img.nextElementSibling;
      if (fallback instanceof HTMLElement) {
        fallback.style.display = 'flex';
      }
    });
  });
}

export function renderMessageButton(feedId: string, member: FeedMemberInfo, canMessage: boolean): string {
  return `
    <button class="lfa-member-icon-btn${canMessage ? '' : ' lfa-member-icon-btn--disabled'}" data-member-action="message" data-member-id="${escapeHtml(member.id)}" data-feed-id="${escapeHtml(feedId)}" title="${canMessage ? 'Open chat' : 'Messaging unavailable'}" ${canMessage ? '' : 'disabled aria-disabled="true"'}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </button>
  `;
}

export function renderMemberStatusAction(
  feedId: string,
  member: FeedMemberInfo,
  status: ReturnType<typeof getMemberStatus>
): string {
  if (member.transientAction === 'connect') {
    return `<div class="lfa-member-status lfa-member-status--loading" aria-label="Sending connect request">
      ${getMemberStatusMarkup('loading')}
    </div>`;
  }

  if (status === 'pending' || status === 'connected' || status === 'withdrawn' || status === 'unavailable' || status === 'loading') {
    const tooltip = getMemberStatusTooltip(status);
    const tooltipAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : '';

    if (status === 'loading') {
      return `<div class="lfa-member-status lfa-member-status--loading" aria-label="Loading status"${tooltipAttr}>
        ${getMemberStatusMarkup(status)}
      </div>`;
    }

    return `<div class="lfa-member-status lfa-member-status--${status}" aria-label="Connection status"${tooltipAttr}>
      ${getMemberStatusMarkup(status)}
    </div>`;
  }

  if (member.canFollow && member.canConnect) {
    return `
      <div class="lfa-member-status lfa-member-status--split" aria-label="Profile actions">
        <button
          class="lfa-member-status-split-btn lfa-member-status-split-btn--follow"
          data-member-action="follow-toggle"
          data-member-id="${escapeHtml(member.id)}"
          data-feed-id="${escapeHtml(feedId)}"
          data-follow-state="${member.isFollowing ? 'inactive' : 'active'}"
          type="button"
        >
          ${member.isFollowing ? 'Unfollow' : 'Follow'}
        </button>
        <button
          class="lfa-member-status-split-btn lfa-member-status-split-btn--connect"
          data-member-action="connect"
          data-member-id="${escapeHtml(member.id)}"
          data-feed-id="${escapeHtml(feedId)}"
          type="button"
        >
          Connect
        </button>
      </div>
    `;
  }

  if (member.canFollow && !member.canConnect) {
    return `
      <button
        class="lfa-member-status lfa-member-status--${member.isFollowing ? 'following' : 'follow'}"
        data-member-action="follow-toggle"
        data-member-id="${escapeHtml(member.id)}"
        data-feed-id="${escapeHtml(feedId)}"
        data-follow-state="${member.isFollowing ? 'inactive' : 'active'}"
        type="button"
      >
        <span>${member.isFollowing ? 'Unfollow' : 'Follow'}</span>
      </button>
    `;
  }

  const tooltip = getMemberStatusTooltip(status);
  const tooltipAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : '';

  if (status === 'connect') {
    return `<button class="lfa-member-status lfa-member-status--${status}" data-member-action="connect" data-member-id="${escapeHtml(member.id)}" data-feed-id="${escapeHtml(feedId)}" type="button" aria-label="Send connect request"${tooltipAttr}>
      ${getMemberStatusMarkup(status)}
    </button>`;
  }

  return `<div class="lfa-member-status lfa-member-status--${status}" aria-label="Connection status"${tooltipAttr}>
    ${getMemberStatusMarkup(status)}
  </div>`;
}

export function bindMemberActionButtons(root: ParentNode, deps: MemberActionDeps): void {
  const {
    openLinkedInMessage,
    openLinkedInProfile,
    fetchLinkedInRelationshipStatus,
    resolveProfileUrn,
    sendLinkedInConnectRequest,
    sendLinkedInFollowState,
    invalidateCacheForUser,
    getFeedMembersById,
    showToast,
    renderSidebarContent,
  } = deps;

  bindAvatarFallbacks(root);

  root.querySelectorAll('[data-member-action="message"]').forEach((btn) => {
    const element = btn as HTMLElement;
    if (element.dataset.lfaBoundMessage === 'true') {
      return;
    }
    element.dataset.lfaBoundMessage = 'true';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const memberId = (btn as HTMLElement).getAttribute('data-member-id');
      const feedId = (btn as HTMLElement).getAttribute('data-feed-id');
      if (!memberId || !feedId) return;

      const member = (getFeedMembersById()[feedId] || []).find((item) => item.id === memberId);
      if (member?.linkedinUrl && member.canMessage) {
        openLinkedInMessage(member.linkedinUrl, member.profileUrn);
      }
    });
  });

  root.querySelectorAll('[data-member-action="connect"]').forEach((btn) => {
    const element = btn as HTMLElement;
    if (element.dataset.lfaBoundConnect === 'true') {
      return;
    }
    element.dataset.lfaBoundConnect = 'true';

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const memberId = (btn as HTMLElement).getAttribute('data-member-id');
      const feedId = (btn as HTMLElement).getAttribute('data-feed-id');
      if (!memberId || !feedId) return;

      const member = (getFeedMembersById()[feedId] || []).find((item) => item.id === memberId);
      if (!member) return;

      try {
        if (!member.profileUrn) {
          try {
            const relationship = await fetchLinkedInRelationshipStatus(member);
            member.profileUrn = relationship.profileUrn;
            member.status = relationship.status;
            member.canFollow = relationship.canFollow;
            member.canConnect = relationship.canConnect;
            member.isFollowing = relationship.isFollowing;
            member.memberNumericId = relationship.memberNumericId;
            renderSidebarContent();
          } catch {
            // status resolution failed — try to get just the profileUrn
          }
        }

        if (!member.profileUrn && member.linkedinUsername) {
          member.profileUrn = (await resolveProfileUrn(member.linkedinUsername)) ?? undefined;
        }

        if (!member.profileUrn) {
          throw new Error('Could not resolve LinkedIn profile URN');
        }

        await sendLinkedInConnectRequest(member.profileUrn);
        invalidateCacheForUser(member.linkedinUsername);
        member.transientAction = 'connect';
        member.canConnect = false;
        renderSidebarContent();

        try {
          await new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), 450);
          });

          const refreshed = await fetchLinkedInRelationshipStatus(member);
          member.status = refreshed.status;
          member.profileUrn = refreshed.profileUrn ?? member.profileUrn;
          member.canMessage = refreshed.canMessage;
          member.canFollow = refreshed.canFollow;
          member.canConnect = refreshed.canConnect;
          member.isFollowing = refreshed.isFollowing;
          member.memberNumericId = refreshed.memberNumericId ?? member.memberNumericId;
          member.isPremium = refreshed.isPremium;
        } catch {
          member.status = 'pending';
          member.canConnect = false;
        } finally {
          member.transientAction = undefined;
        }

        renderSidebarContent();
        showToast(connectRequestSentMessage(), 'success');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Failed to send connect request', 'error');
      }
    });
  });

  root.querySelectorAll('[data-member-action="follow-toggle"]').forEach((btn) => {
    const element = btn as HTMLElement;
    if (element.dataset.lfaBoundFollowToggle === 'true') {
      return;
    }
    element.dataset.lfaBoundFollowToggle = 'true';

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();

      const memberId = element.getAttribute('data-member-id');
      const feedId = element.getAttribute('data-feed-id');
      const followState = element.getAttribute('data-follow-state');
      const shouldFollow = followState === 'active';
      if (!memberId || !feedId) return;

      const member = (getFeedMembersById()[feedId] || []).find((item) => item.id === memberId);
      if (!member?.memberNumericId || !member.profileUrn || !member.linkedinUsername) {
        showToast(`Couldn't resolve LinkedIn follow data for ${member?.displayName || 'this profile'}`, 'error');
        return;
      }

      element.setAttribute('disabled', 'true');

      try {
        await sendLinkedInFollowState(
          member.memberNumericId,
          member.profileUrn,
          member.linkedinUsername,
          shouldFollow
        );

        invalidateCacheForUser(member.linkedinUsername);
        member.canFollow = true;
        member.isFollowing = shouldFollow;
        member.status = shouldFollow && !member.canConnect ? 'following' : member.status === 'following' ? 'connect' : member.status;
        renderSidebarContent();
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : `Failed to ${shouldFollow ? 'follow' : 'unfollow'} profile`,
          'error'
        );
      } finally {
        element.removeAttribute('disabled');
      }
    });
  });

  root.querySelectorAll('[data-member-action="open-profile"]').forEach((btn) => {
    const element = btn as HTMLElement;
    if (element.dataset.lfaBoundOpenProfile === 'true') {
      return;
    }
    element.dataset.lfaBoundOpenProfile = 'true';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const memberId = (btn as HTMLElement).getAttribute('data-member-id');
      const feedId = (btn as HTMLElement).getAttribute('data-feed-id');
      if (!memberId || !feedId) return;

      const member = (getFeedMembersById()[feedId] || []).find((item) => item.id === memberId);
      if (member?.linkedinUrl) {
        openLinkedInProfile(member.linkedinUrl);
      }
    });
  });
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
  const canMessage = status === 'loading' ? false : (member.canMessage ?? status === 'connected');
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
  const result = await deps.sendMsg({
    type: 'FEEDS_REMOVE_MEMBER',
    ownerId: feed?.ownerId,
    feedId,
    memberId,
  });

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

    const removeResult = await deps.sendMsg({
      type: 'FEEDS_REMOVE_MEMBER',
      ownerId: deps.getFeeds().find((feed) => feed.id === editorState.feedId)?.ownerId,
      feedId: editorState.feedId,
      memberId: editorState.member.id,
    });

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

  const result = await deps.sendMsg({
    type: 'FEEDS_UPDATE_MEMBER',
    ownerId: deps.getFeeds().find((feed) => feed.id === editorState.feedId)?.ownerId,
    feedId: editorState.feedId,
    memberId: editorState.member.id,
    updates,
  });

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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
