import type { FeedMemberInfo } from '../types';
import {
  canMemberReceiveMessage,
  getMemberInitials,
  getMemberStatusMarkup,
  getMemberStatusTooltip,
} from '../utils';
import type { getMemberStatus } from '../utils';
import { connectRequestSentMessage } from '../../shared/toast-messages';
import type { MemberActionDeps } from './member-action-types';
import { escapeHtml } from './escape-html';

function shouldPreserveWithdrawnStatus(
  currentStatus: FeedMemberInfo['status'],
  nextStatus?: FeedMemberInfo['status']
): boolean {
  return currentStatus === 'withdrawn' && (nextStatus === 'connect' || nextStatus === 'following');
}

function shouldPreserveUnavailableStatus(
  currentStatus: FeedMemberInfo['status'],
  nextStatus?: FeedMemberInfo['status']
): boolean {
  return (
    currentStatus === 'unavailable' &&
    (nextStatus === 'connect' || nextStatus === 'following' || nextStatus === 'pending')
  );
}

function applyResolvedRelationshipToMember(
  member: FeedMemberInfo,
  relationship: Awaited<ReturnType<MemberActionDeps['fetchLinkedInRelationshipStatus']>>
): void {
  const preserveWithdrawn = shouldPreserveWithdrawnStatus(member.status, relationship.status);
  const preserveUnavailable = shouldPreserveUnavailableStatus(member.status, relationship.status);

  member.profileUrn = relationship.profileUrn;
  member.status = preserveUnavailable ? 'unavailable' : preserveWithdrawn ? 'withdrawn' : relationship.status;
  member.canMessage = preserveUnavailable ? false : relationship.canMessage;
  member.canFollow = preserveUnavailable ? false : relationship.canFollow;
  member.canConnect = preserveWithdrawn || preserveUnavailable ? false : relationship.canConnect;
  member.isFollowing = preserveUnavailable ? false : relationship.isFollowing;
  member.memberNumericId = relationship.memberNumericId;
  member.isPremium = relationship.isPremium;
  member.profileImageUrl = relationship.profileImageUrl || member.profileImageUrl;
  member.statusResolvedAt = Date.now();
}

function getMemberSplitStateMarkup(status: ReturnType<typeof getMemberStatus>): string {
  if (status !== 'withdrawn') {
    return getMemberStatusMarkup(status);
  }

  return `
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="5.25"></circle>
        <path d="M5.4 8h5.2"></path>
      </svg>
      <span>Resend</span>
    `;
}

export function renderMemberAvatar(member: FeedMemberInfo): string {
  return member.profileImageUrl
    ? `<img class="lfa-member-avatar" src="${escapeHtml(member.profileImageUrl)}" alt="${escapeHtml(member.displayName)}" data-lfa-avatar-img="true" /><div class="lfa-member-avatar lfa-member-avatar--fallback" style="display:none;">${escapeHtml(getMemberInitials(member.displayName))}</div>`
    : `<div class="lfa-member-avatar lfa-member-avatar--fallback">${escapeHtml(getMemberInitials(member.displayName))}</div>`;
}

export function bindAvatarFallbacks(root: ParentNode): void {
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

  if (status === 'connected' || status === 'unavailable' || status === 'loading') {
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

  const isConnectActionAvailable = status === 'connect' || status === 'following';
  const connectTooltip = isConnectActionAvailable ? getMemberStatusTooltip('connect') : getMemberStatusTooltip(status);
  const connectTooltipAttr = connectTooltip ? ` title="${escapeHtml(connectTooltip)}"` : '';
  const stateTooltip = !isConnectActionAvailable && connectTooltip
    ? `<span class="lfa-member-status-tooltip" role="tooltip">${escapeHtml(connectTooltip)}</span>`
    : '';
  const followLabel = member.isFollowing ? 'Unfollow' : 'Follow';
  const hasStateConnectArea = !isConnectActionAvailable;
  const splitClass = hasStateConnectArea
    ? 'lfa-member-status lfa-member-status--split lfa-member-status--split-state'
    : 'lfa-member-status lfa-member-status--split';
  const connectArea = isConnectActionAvailable
    ? `<button
        class="lfa-member-status-split-btn lfa-member-status-split-btn--connect"
        data-member-action="connect"
        data-member-id="${escapeHtml(member.id)}"
        data-feed-id="${escapeHtml(feedId)}"
        type="button"
        aria-label="Send connect request"${connectTooltipAttr}
      >
        Connect
      </button>`
    : `<button
        class="lfa-member-status-split-btn lfa-member-status-split-btn--${status} lfa-member-status-split-btn--state"
        type="button"
        aria-disabled="true"
        aria-label="${escapeHtml(connectTooltip || 'Connection status')}"
      >
        ${getMemberSplitStateMarkup(status)}
      </button>${stateTooltip}`;

  return `
    <div class="${splitClass}" aria-label="Profile actions">
      <button
        class="lfa-member-status-split-btn lfa-member-status-split-btn--follow"
        data-member-action="follow-toggle"
        data-member-id="${escapeHtml(member.id)}"
        data-feed-id="${escapeHtml(feedId)}"
        data-follow-state="${member.isFollowing ? 'inactive' : 'active'}"
        type="button"
      >
        ${followLabel}
      </button>
      ${connectArea}
    </div>
  `;
}

function isConnectCooldownError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /withdraw|cooldown|resend|invitation|invite|already sent|cannot send|unable to send/i.test(message);
}

function shouldSkipConnectRequest(
  relationship: Awaited<ReturnType<MemberActionDeps['fetchLinkedInRelationshipStatus']>>
): boolean {
  return (
    relationship.status === 'connected' ||
    relationship.status === 'pending' ||
    relationship.status === 'withdrawn' ||
    relationship.status === 'unavailable'
  );
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
    getFeeds,
    persistResolvedMemberState,
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
      const feed = getFeeds().find((item) => item.id === feedId);
      const canMessage = member
        ? canMemberReceiveMessage(member, undefined, {
            allowUnverifiedProfileMessage: feed?.systemType === 'profileViewers',
          })
        : false;
      if (member?.linkedinUrl && canMessage) {
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
        try {
          const relationship = await fetchLinkedInRelationshipStatus(member);
          applyResolvedRelationshipToMember(member, relationship);
          void persistResolvedMemberState?.(feedId, member);
          renderSidebarContent();

          if (shouldSkipConnectRequest(relationship)) {
            showToast('Profile status updated', 'success');
            return;
          }
        } catch {
          // Status resolution failed - try to get just the profileUrn.
        }

        if (!member.profileUrn) {
          try {
            const relationship = await fetchLinkedInRelationshipStatus(member);
            applyResolvedRelationshipToMember(member, relationship);
            void persistResolvedMemberState?.(feedId, member);
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

        await sendLinkedInConnectRequest(member.profileUrn, member.linkedinUrl);
        invalidateCacheForUser(member.linkedinUsername);
        member.transientAction = 'connect';
        member.canConnect = false;
        renderSidebarContent();

        try {
          await new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), 450);
          });

          const refreshed = await fetchLinkedInRelationshipStatus(member);
          applyResolvedRelationshipToMember(member, {
            ...refreshed,
            profileUrn: refreshed.profileUrn ?? member.profileUrn,
            memberNumericId: refreshed.memberNumericId ?? member.memberNumericId,
          });
        } catch {
          member.status = 'pending';
          member.canConnect = false;
          member.statusResolvedAt = Date.now();
        } finally {
          member.transientAction = undefined;
        }

        void persistResolvedMemberState?.(feedId, member);
        renderSidebarContent();
        showToast(connectRequestSentMessage(), 'success');
      } catch (error) {
        if (isConnectCooldownError(error)) {
          member.status = 'withdrawn';
          member.canConnect = false;
          member.statusResolvedAt = Date.now();
          member.transientAction = undefined;
          void persistResolvedMemberState?.(feedId, member);
          renderSidebarContent();
        }
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
      const statusBeforeFollow = member?.status;
      if (
        member &&
        member.linkedinUsername &&
        (!member.memberNumericId || !member.profileUrn)
      ) {
        try {
          const relationship = await fetchLinkedInRelationshipStatus(member, {
            requireActionIdentifiers: true,
          });
          applyResolvedRelationshipToMember(member, relationship);
          void persistResolvedMemberState?.(feedId, member);
          renderSidebarContent();
        } catch {
          // Follow can proceed only after resolving the LinkedIn member identifiers.
        }
      }

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
        member.status =
          statusBeforeFollow === 'withdrawn'
            ? 'withdrawn'
            : shouldFollow && !member.canConnect
              ? 'following'
              : member.status === 'following'
                ? 'connect'
                : member.status;
        if (member.status === 'withdrawn') {
          member.canConnect = false;
        }
        member.statusResolvedAt = Date.now();
        void persistResolvedMemberState?.(feedId, member);
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
