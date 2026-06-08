import type { FeedInfo, ProfileData } from '../types';
import {
  profileAlreadyInFeedMessage,
  feedCreatedAndProfileAddedMessage,
  feedCreatedButProfileAddFailedMessage,
  signedInMessage,
} from '../../shared/toast-messages';
import { CONTENT_COPY } from '../../shared/copy';
import { enrichProfileDataForFeed } from '../../shared/enrich-profile-data';

interface DomBindingDeps {
  handleAddToFeed: () => Promise<void>;
  showCreateFeedOverlay: () => void;
  refreshCardState: () => Promise<void>;
  getCurrentProfileData: () => ProfileData | null;
  sendMessageToBackground: (message: Record<string, unknown>) => Promise<unknown>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  emitFeedMemberAdded: (feedId: string, feedName: string, member: unknown) => void;
}

const boundElements = new WeakSet<EventTarget>();
let createFeedSubmitInFlight = false;

function bindClickOnce(element: Element | null, handler: () => void | Promise<void>): void {
  if (!element || boundElements.has(element)) {
    return;
  }

  element.addEventListener('click', () => {
    void handler();
  });
  boundElements.add(element);
}

function setupOverlayClose(buttonId: string, overlayId: string): void {
  const closeButton = document.getElementById(buttonId);
  const overlay = document.getElementById(overlayId);

  if (!closeButton || !overlay) {
    return;
  }

  bindClickOnce(closeButton, () => {
    overlay.style.display = 'none';
  });

  if (!boundElements.has(overlay)) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.style.display = 'none';
      }
    });
    boundElements.add(overlay);
  }
}

export function setupProfileContentDomBindings(deps: DomBindingDeps): void {
  bindClickOnce(document.getElementById('pf-add-to-feed-btn'), () => {
    void deps.handleAddToFeed();
  });

  setupOverlayClose('pf-feed-modal-close', 'pf-feed-modal-overlay');
  setupOverlayClose('pf-create-feed-close', 'pf-create-feed-overlay');
  setupOverlayClose('pf-auth-close', 'pf-auth-overlay');

  bindClickOnce(document.getElementById('pf-feed-modal-create'), () => {
    deps.showCreateFeedOverlay();
  });

  document.querySelectorAll('.pf-color-option').forEach((element) => {
    bindClickOnce(element, () => {
      document.querySelectorAll('.pf-color-option').forEach((option) => option.classList.remove('active'));
      element.classList.add('active');
    });
  });

  bindClickOnce(document.getElementById('pf-create-feed-submit'), async () => {
    if (createFeedSubmitInFlight) {
      return;
    }

    const nameInput = document.getElementById('pf-create-feed-name') as HTMLInputElement | null;
    const descInput = document.getElementById('pf-create-feed-desc') as HTMLInputElement | null;
    const activeColor = document.querySelector('.pf-color-option.active') as HTMLElement | null;
    const createOverlay = document.getElementById('pf-create-feed-overlay');
    const submitButton = document.getElementById('pf-create-feed-submit') as HTMLButtonElement | null;

    const name = nameInput?.value.trim();
    if (!name || !submitButton) {
      nameInput?.focus();
      return;
    }

    createFeedSubmitInFlight = true;
    submitButton.setAttribute('disabled', 'true');
    submitButton.textContent = CONTENT_COPY.profile.creatingFeedSubmit;

    try {
      const result = (await deps.sendMessageToBackground({
        type: 'FEEDS_CREATE',
        name,
        description: descInput?.value.trim() || '',
        color: activeColor?.getAttribute('data-color') || '#615DEC',
      })) as { success: boolean; feed?: FeedInfo; error?: string } | null;

      const currentProfileData = deps.getCurrentProfileData();
      if (result?.success && result.feed && currentProfileData) {
        const enrichedProfileData = await enrichProfileDataForFeed(currentProfileData);
        Object.assign(currentProfileData, enrichedProfileData, {
          memberId: enrichedProfileData.memberNumericId || currentProfileData.memberId,
        });

        const addResult = (await deps.sendMessageToBackground({
          type: 'FEEDS_ADD_MEMBER',
          feedId: result.feed.id,
          profileData: enrichedProfileData,
        })) as { success: boolean; member?: unknown; alreadyExists?: boolean } | null;

        if (createOverlay) {
          createOverlay.style.display = 'none';
        }

        if (addResult?.success) {
          if (addResult.alreadyExists) {
            deps.showToast(profileAlreadyInFeedMessage(enrichedProfileData.displayName, name), 'error');
            await deps.refreshCardState();
            return;
          }
          if (addResult.member) {
            deps.emitFeedMemberAdded(result.feed.id, result.feed.name, addResult.member);
          }
          deps.showToast(feedCreatedAndProfileAddedMessage(name), 'success');
          await deps.refreshCardState();
        } else {
          deps.showToast(feedCreatedButProfileAddFailedMessage(name), 'error');
        }
      } else {
        deps.showToast(result?.error || 'Failed to create feed', 'error');
      }
    } finally {
      createFeedSubmitInFlight = false;
      submitButton.removeAttribute('disabled');
      submitButton.textContent = CONTENT_COPY.profile.createFeedSubmit;
    }
  });

  bindClickOnce(document.getElementById('pf-auth-google-btn'), async () => {
    const authOverlay = document.getElementById('pf-auth-overlay');
    const googleButton = document.getElementById('pf-auth-google-btn') as HTMLButtonElement | null;
    if (!googleButton) {
      return;
    }

    googleButton.textContent = CONTENT_COPY.common.signingIn;
    googleButton.disabled = true;

    const result = (await deps.sendMessageToBackground({
      type: 'FEEDS_SIGN_IN',
    })) as { success: boolean; error?: string } | null;

    if (result?.success) {
      if (authOverlay) {
        authOverlay.style.display = 'none';
      }
      deps.showToast(signedInMessage(), 'success');
      await deps.refreshCardState();
    } else {
      deps.showToast(result?.error || 'Sign in failed', 'error');
    }

    googleButton.textContent = CONTENT_COPY.profile.authButton;
    googleButton.disabled = false;
  });
}
