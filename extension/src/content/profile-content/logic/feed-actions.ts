import {
  syncCurrentProfileMembershipStatuses,
  syncCurrentProfileViewerStatus,
} from './relationship';
import type { FeedInfo, FeedMembership, ProfileData } from '../types';
import { feedAddedMessage, profileAlreadyInFeedMessage, profileRemovedFromFeedMessage } from '../../shared/toast-messages';
import { CONTENT_COPY, getMemberCountLabel } from '../../shared/copy';
import { escapeHtml } from '../utils';
import { enrichProfileDataForFeed } from '../../shared/enrich-profile-data';

interface FeedActionDeps {
  getCurrentProfileData: () => ProfileData | null;
  sendMessageToBackground: (message: Record<string, unknown>) => Promise<unknown>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  emitFeedMemberAdded: (feedId: string, feedName: string, member: unknown) => void;
}

export function createFeedActions(deps: FeedActionDeps) {
  async function getEnrichedCurrentProfileData(): Promise<ProfileData | null> {
    const currentProfileData = deps.getCurrentProfileData();
    if (!currentProfileData) {
      return null;
    }

    const enrichedProfileData = await enrichProfileDataForFeed(currentProfileData);
    Object.assign(currentProfileData, enrichedProfileData, {
      memberId: enrichedProfileData.memberNumericId || currentProfileData.memberId,
    });

    return currentProfileData;
  }

  function resetFeedSelectionModalState(body: HTMLElement): void {
    body.classList.remove('is-submitting');
  }

  function setAddToFeedButtonLoading(isLoading: boolean): void {
    const button = document.getElementById('pf-add-to-feed-btn') as HTMLButtonElement | null;
    if (!button) {
      return;
    }

    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent?.trim() || 'Add to feed';
    }

    if (isLoading) {
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = `
        <span class="pf-inline-spinner" aria-hidden="true"></span>
        <span>${CONTENT_COPY.profile.addToFeedLoading}</span>
      `;
      return;
    }

    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = button.dataset.defaultLabel;
  }

  function renderFeedModalLoadingState(body: HTMLElement): void {
    body.innerHTML = `
      <div class="pf-feed-modal-loading">
        <div class="pf-feed-modal-loading-spinner pf-inline-spinner" aria-hidden="true"></div>
        <span>${CONTENT_COPY.profile.loadingFeeds}</span>
      </div>
    `;
  }

  async function checkAuth(): Promise<boolean> {
    const response = (await deps.sendMessageToBackground({ type: 'FEEDS_GET_AUTH_STATE' })) as {
      isAuthenticated: boolean;
    } | null;

    return response?.isAuthenticated === true;
  }

  async function showFeedSelectionModal(feeds: FeedInfo[], refreshCardState: () => Promise<void>): Promise<void> {
    const overlay = document.getElementById('pf-feed-modal-overlay');
    const body = document.getElementById('pf-feed-modal-body');
    const currentProfileData = await getEnrichedCurrentProfileData();

    if (!overlay || !body) {
      return;
    }

    overlay.style.display = 'flex';
    resetFeedSelectionModalState(body);
    renderFeedModalLoadingState(body);

    const memberships = (await deps.sendMessageToBackground({
      type: 'FEEDS_GET_PROFILE_MEMBERSHIPS',
      linkedinUsername: currentProfileData?.linkedinUsername,
      linkedinUrl: currentProfileData?.linkedinUrl,
      memberNumericId: currentProfileData?.memberId,
    })) as { memberships: FeedMembership[] } | null;

    const membershipMap = new Map((memberships?.memberships || []).map((membership) => [membership.feedId, membership]));

    body.innerHTML = feeds
      .map((feed) => {
        const isMember = membershipMap.has(feed.id);
        return `
          <div class="pf-feed-option ${isMember ? 'already-added' : ''}"
               data-feed-id="${feed.id}"
               data-feed-name="${escapeHtml(feed.name)}"
               ${isMember ? '' : 'role="button" tabindex="0"'}>
            <div class="pf-feed-option-left">
              <div class="pf-feed-option-dot" style="background:${escapeHtml(feed.color || '#615DEC')}"></div>
              <span class="pf-feed-option-name">${escapeHtml(feed.name)}</span>
              <span class="pf-feed-option-count">${getMemberCountLabel(feed.memberCount)}</span>
            </div>
            <div class="pf-feed-option-status">
              ${isMember ? '<span class="pf-feed-option-check">&#10003;</span>' : ''}
            </div>
          </div>
        `;
      })
      .join('');

    body.querySelectorAll('.pf-feed-option:not(.already-added)').forEach((element) => {
      element.addEventListener('click', async () => {
        const feedId = element.getAttribute('data-feed-id');
        const feedName = element.getAttribute('data-feed-name');
        const profileData = await getEnrichedCurrentProfileData();
        if (!feedId || !profileData || body.classList.contains('is-submitting')) {
          return;
        }

        body.classList.add('is-submitting');
        body.querySelectorAll('.pf-feed-option').forEach((option) => option.classList.add('is-disabled'));
        element.classList.remove('is-disabled');
        element.classList.add('is-submitting');

        const status = element.querySelector('.pf-feed-option-status');
        if (status) {
          status.innerHTML = `
            <span class="pf-feed-option-loading">
              <span class="pf-inline-spinner" aria-hidden="true"></span>
              <span>${CONTENT_COPY.profile.addToFeedSubmitting}</span>
            </span>
          `;
        }

        const result = (await deps.sendMessageToBackground({
          type: 'FEEDS_ADD_MEMBER',
          feedId,
          profileData,
        })) as { success: boolean; error?: string; member?: unknown; alreadyExists?: boolean } | null;

        if (result?.success) {
          if (result.alreadyExists) {
            resetFeedSelectionModalState(body);
            deps.showToast(profileAlreadyInFeedMessage(profileData.displayName, feedName || ''), 'error');
            overlay.style.display = 'none';
            await refreshCardState();
            return;
          }
          resetFeedSelectionModalState(body);
          if (result.member) {
            deps.emitFeedMemberAdded(feedId, feedName || '', result.member);
          }
          deps.showToast(feedAddedMessage(profileData.displayName, feedName || ''), 'success');
          overlay.style.display = 'none';
          await refreshCardState();
        } else {
          resetFeedSelectionModalState(body);
          body.querySelectorAll('.pf-feed-option').forEach((option) => option.classList.remove('is-disabled', 'is-submitting'));
          if (status) {
            status.innerHTML = '';
          }
          deps.showToast(result?.error || CONTENT_COPY.profile.failedToAdd, 'error');
        }
      });
    });
  }

  function showCreateFeedOverlay(): void {
    const overlay = document.getElementById('pf-create-feed-overlay');
    const feedModal = document.getElementById('pf-feed-modal-overlay');

    if (feedModal) {
      feedModal.style.display = 'none';
    }
    if (overlay) {
      overlay.style.display = 'flex';
    }

    const nameInput = document.getElementById('pf-create-feed-name') as HTMLInputElement | null;
    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }

    const descInput = document.getElementById('pf-create-feed-desc') as HTMLInputElement | null;
    if (descInput) {
      descInput.value = '';
    }

    document.querySelectorAll('.pf-color-option').forEach((element) => element.classList.remove('active'));
    document.querySelector('.pf-color-option[data-color="#615DEC"]')?.classList.add('active');
  }

  function showAuthModal(): void {
    const overlay = document.getElementById('pf-auth-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
    }
  }

  async function refreshCardState(): Promise<void> {
    const currentProfileData = await getEnrichedCurrentProfileData();
    if (!currentProfileData) {
      return;
    }

    const memberships = (await deps.sendMessageToBackground({
      type: 'FEEDS_GET_PROFILE_MEMBERSHIPS',
      linkedinUsername: currentProfileData.linkedinUsername,
      linkedinUrl: currentProfileData.linkedinUrl,
      memberNumericId: currentProfileData.memberNumericId || currentProfileData.memberId,
      profileUrn: currentProfileData.profileUrn,
    })) as { memberships: FeedMembership[] } | null;

    const list = memberships?.memberships || [];
    const infoText = document.getElementById('pf-feed-info-text');
    const membershipsEl = document.getElementById('pf-feed-memberships');
    const statusBadge = document.getElementById('pf-feed-status-badge');
    const statusIcon = document.getElementById('pf-feed-status-icon');

    await syncCurrentProfileViewerStatus({
      getCurrentProfileData: deps.getCurrentProfileData,
      sendMessageToBackground: deps.sendMessageToBackground,
    });

    if (list.length > 0) {
      await syncCurrentProfileMembershipStatuses(list, {
        getCurrentProfileData: deps.getCurrentProfileData,
        sendMessageToBackground: deps.sendMessageToBackground,
      });

      if (infoText) {
        infoText.innerHTML = `<strong>${escapeHtml(currentProfileData.displayName)}</strong> is in ${list.length} feed${list.length > 1 ? 's' : ''}`;
      }

      if (membershipsEl) {
        membershipsEl.innerHTML = list
          .map(
            (membership) =>
              `<span class="pf-feed-membership-tag" style="background:#615DEC" data-feed-id="${membership.feedId}" data-member-id="${membership.memberId}">${escapeHtml(membership.feedName)}<span class="pf-remove-tag" title="Remove from feed">&times;</span></span>`
          )
          .join('');

        membershipsEl.querySelectorAll('.pf-remove-tag').forEach((button) => {
          button.addEventListener('click', async (event) => {
            event.stopPropagation();
            const tag = button.closest('.pf-feed-membership-tag') as HTMLElement | null;
            const feedId = tag?.getAttribute('data-feed-id');
            const memberId = tag?.getAttribute('data-member-id');
            if (!feedId || !memberId) {
              return;
            }

            const result = (await deps.sendMessageToBackground({
              type: 'FEEDS_REMOVE_MEMBER',
              feedId,
              memberId,
            })) as { success: boolean } | null;

            if (result?.success) {
              deps.showToast(profileRemovedFromFeedMessage(), 'success');
              await refreshCardState();
            }
          });
        });
      }

      statusBadge?.classList.add('in-feed');
      if (statusIcon) {
        statusIcon.textContent = '\u2713';
      }
      return;
    }

    if (infoText) {
      infoText.innerHTML = `<strong>${escapeHtml(currentProfileData.displayName)}</strong> is not in any feed`;
    }
    if (membershipsEl) {
      membershipsEl.innerHTML = '';
    }
    statusBadge?.classList.remove('in-feed');
    if (statusIcon) {
      statusIcon.textContent = '\u2717';
    }
  }

  async function handleAddToFeed(): Promise<void> {
    setAddToFeedButtonLoading(true);

    try {
      const isAuth = await checkAuth();
      if (!isAuth) {
        showAuthModal();
        return;
      }

      const response = (await deps.sendMessageToBackground({ type: 'FEEDS_GET_ALL' })) as {
        feeds: FeedInfo[];
      } | null;

      const feeds = response?.feeds || [];
      if (feeds.length === 0) {
        showCreateFeedOverlay();
        return;
      }

      await showFeedSelectionModal(feeds, refreshCardState);
    } finally {
      setAddToFeedButtonLoading(false);
    }
  }

  return {
    checkAuth,
    handleAddToFeed,
    showCreateFeedOverlay,
    showAuthModal,
    refreshCardState,
    syncProfileViewerStatus: () =>
      syncCurrentProfileViewerStatus({
        getCurrentProfileData: deps.getCurrentProfileData,
        sendMessageToBackground: deps.sendMessageToBackground,
      }),
  };
}
