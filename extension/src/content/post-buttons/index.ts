import type { LinkedInProfileData } from '../../../../shared/types';
import { POST_BUTTONS_CSS } from './styles';
import { CONTENT_COPY, getMemberCountLabel } from '../shared/copy';
import type { FeedSummary, PostAuthorProfile } from './types';
import { feedAddedMessage, profileAlreadyInFeedMessage } from '../shared/toast-messages';
import { showToast } from '../shared/toast';
import { escapeHtml, extractPostAuthorProfile } from './utils';

const POST_SELECTOR = '.feed-shared-update-v2[role="article"], .feed-shared-update-v2[data-urn]';
const POST_FLAG = 'data-lfa-post-buttons-bound';
const STYLE_ID = 'lfa-post-buttons-styles';
const MODAL_ID = 'lfa-post-feed-modal-overlay';
const TOGGLE_ID = 'lfa-post-toggle-btn';
const DRAWER_ID = 'lfa-post-drawer-btn';

let observer: MutationObserver | null = null;
let iconUrl = '';
let activeProfile: PostAuthorProfile | null = null;

function sendMessage<T>(message: Record<string, unknown>): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve((response || null) as T | null));
  });
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = POST_BUTTONS_CSS;
  document.head.appendChild(style);
}

function ensureModal(): HTMLDivElement {
  const existing = document.getElementById(MODAL_ID) as HTMLDivElement | null;
  if (existing) {
    return existing;
  }

  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  overlay.className = 'lfa-post-feed-modal-overlay';
  overlay.innerHTML = `
    <div class="lfa-post-feed-modal">
      <button class="lfa-post-feed-modal__close" type="button" aria-label="Close">&times;</button>
      <div class="lfa-post-feed-modal__header">
        <h3 class="lfa-post-feed-modal__title">${CONTENT_COPY.postButtons.addToFeedTitle}</h3>
        <div class="lfa-post-feed-modal__subtitle" id="lfa-post-feed-modal-subtitle"></div>
      </div>
      <div class="lfa-post-feed-modal__body" id="lfa-post-feed-modal-body"></div>
      <div class="lfa-post-feed-modal__footer">
        <div class="lfa-post-feed-modal__hint">${CONTENT_COPY.postButtons.chooseFeedHint}</div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.style.display = 'none';
    }
  });
  overlay.querySelector('.lfa-post-feed-modal__close')?.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  document.body.appendChild(overlay);
  return overlay;
}

async function getFeeds(): Promise<FeedSummary[]> {
  const response = await sendMessage<{ success: boolean; feeds?: FeedSummary[]; error?: string }>({ type: 'FEEDS_GET_ALL' });
  if (!response?.success) {
    throw new Error(response?.error || 'Failed to load feeds');
  }
  return response.feeds || [];
}

async function getMemberships(profile: LinkedInProfileData): Promise<Map<string, string>> {
  const response = await sendMessage<{ memberships?: Array<{ feedId: string; memberId: string }> }>({
    type: 'FEEDS_GET_PROFILE_MEMBERSHIPS',
    linkedinUsername: profile.linkedinUsername,
  });

  return new Map((response?.memberships || []).map((membership) => [membership.feedId, membership.memberId]));
}

async function addProfileToFeed(feedId: string, feedName: string, profile: LinkedInProfileData): Promise<boolean> {
  const response = await sendMessage<{ success: boolean; error?: string; alreadyExists?: boolean }>({
    type: 'FEEDS_ADD_MEMBER',
    feedId,
    profileData: profile,
  });

  if (!response?.success) {
    throw new Error(response?.error || `Failed to add to "${feedName}"`);
  }

  return response.alreadyExists !== true;
}

async function openFeedModal(profile: PostAuthorProfile, feeds: FeedSummary[]): Promise<void> {
  const overlay = ensureModal();
  const body = overlay.querySelector<HTMLElement>('#lfa-post-feed-modal-body');
  const subtitle = overlay.querySelector<HTMLElement>('#lfa-post-feed-modal-subtitle');
  if (!body || !subtitle) {
    return;
  }

  activeProfile = profile;
  subtitle.innerHTML = CONTENT_COPY.postButtons.authorAddSubtitle(escapeHtml(profile.displayName));
  body.innerHTML = `<div class="lfa-post-feed-modal__empty">${CONTENT_COPY.postButtons.loadingFeeds}</div>`;
  overlay.style.display = 'flex';

  const memberships = await getMemberships(profile);

  if (feeds.length === 0) {
    body.innerHTML = `
        <div class="lfa-post-feed-modal__empty">
        <div>${CONTENT_COPY.postButtons.noFeedsTitle}</div>
        <div class="lfa-post-feed-modal__hint">${CONTENT_COPY.postButtons.noFeedsHint}</div>
      </div>
    `;
    return;
  }

  body.innerHTML = feeds
    .map((feed) => {
      const isMember = memberships.has(feed.id);
      return `
        <button
          class="lfa-post-feed-option${isMember ? ' already-added' : ''}"
          type="button"
          data-feed-id="${escapeHtml(feed.id)}"
          data-feed-name="${escapeHtml(feed.name)}"
          ${isMember ? 'disabled' : ''}
        >
          <span class="lfa-post-feed-option-left">
            <span class="lfa-post-feed-option-dot" style="background:${escapeHtml(feed.color || '#615DEC')}"></span>
            <span class="lfa-post-feed-option-name">${escapeHtml(feed.name)}</span>
            <span class="lfa-post-feed-option-count">${getMemberCountLabel(feed.memberCount)}</span>
          </span>
          ${isMember ? '<span class="lfa-post-feed-option-check">&#10003;</span>' : ''}
        </button>
      `;
    })
    .join('');

  body.querySelectorAll<HTMLButtonElement>('.lfa-post-feed-option:not(.already-added)').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!activeProfile) {
        return;
      }

      const feedId = button.getAttribute('data-feed-id') || '';
      const feedName = button.getAttribute('data-feed-name') || '';
      if (!feedId || !feedName) {
        return;
      }

      button.disabled = true;
      try {
        const added = await addProfileToFeed(feedId, feedName, activeProfile);
        overlay.style.display = 'none';
        showToast(
          added
            ? feedAddedMessage(activeProfile.displayName, feedName)
            : profileAlreadyInFeedMessage(activeProfile.displayName, feedName),
          added ? 'success' : 'error'
        );
      } catch (error) {
        button.disabled = false;
        showToast(error instanceof Error ? error.message : CONTENT_COPY.postButtons.failedToAddToFeed, 'error');
      }
    });
  });
}

async function handlePostButtonClick(profile: PostAuthorProfile): Promise<void> {
  const authState = await sendMessage<{ isAuthenticated?: boolean }>({ type: 'FEEDS_GET_AUTH_STATE' });
  if (!authState?.isAuthenticated) {
    showToast(CONTENT_COPY.postButtons.signInRequired, 'error');
    return;
  }

  const feeds = await getFeeds();
  if (feeds.length === 1) {
    const added = await addProfileToFeed(feeds[0].id, feeds[0].name, profile);
    showToast(
      added
        ? feedAddedMessage(profile.displayName, feeds[0].name)
        : profileAlreadyInFeedMessage(profile.displayName, feeds[0].name),
      added ? 'success' : 'error'
    );
    return;
  }

  await openFeedModal(profile, feeds);
}

function buildToggleButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lfa-post-toggle-btn';
  button.title = CONTENT_COPY.postButtons.buttonAria;
  button.setAttribute('aria-label', CONTENT_COPY.postButtons.buttonAria);
  button.innerHTML = `<img src="${iconUrl}" alt="" width="14" height="14" />`;
  return button;
}

function buildDrawerButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lfa-post-drawer-btn';
  button.title = CONTENT_COPY.postButtons.buttonAria;
  button.setAttribute('aria-label', CONTENT_COPY.postButtons.buttonAria);
  button.innerHTML = `
    <img src="${iconUrl}" alt="" width="12" height="12" />
    <span class="lfa-post-drawer-btn-label">${CONTENT_COPY.postButtons.drawerLabel}</span>
  `;
  return button;
}

function injectButtonsIntoPost(post: HTMLElement): void {
  if (post.getAttribute(POST_FLAG) === 'true') {
    return;
  }

  const profile = extractPostAuthorProfile(post);
  if (!profile) {
    return;
  }

  post.setAttribute(POST_FLAG, 'true');

  const drawerHost = post.querySelector('.update-components-actor__sub-description, .update-components-actor__meta');
  if (drawerHost && !post.querySelector('.lfa-post-drawer-btn-wrapper')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'lfa-post-drawer-btn-wrapper';
    const drawerButton = buildDrawerButton();
    drawerButton.id = DRAWER_ID;
    drawerButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await handlePostButtonClick(profile);
      } catch (error) {
        showToast(error instanceof Error ? error.message : CONTENT_COPY.postButtons.failedToOpenFeeds, 'error');
      }
    });
    wrapper.appendChild(drawerButton);
    drawerHost.appendChild(wrapper);
  }

  if (!post.querySelector('.lfa-post-toggle')) {
    post.style.overflow = 'visible';
    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'lfa-post-toggle';
    const toggleButton = buildToggleButton();
    toggleButton.id = TOGGLE_ID;
    toggleButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await handlePostButtonClick(profile);
      } catch (error) {
        showToast(error instanceof Error ? error.message : CONTENT_COPY.postButtons.failedToOpenFeeds, 'error');
      }
    });
    toggleWrap.appendChild(toggleButton);
    post.appendChild(toggleWrap);
  }
}

function scanPosts(): void {
  document.querySelectorAll<HTMLElement>(POST_SELECTOR).forEach(injectButtonsIntoPost);
}

export function initPostButtons(): void {
  iconUrl = chrome.runtime.getURL('icons/icon48.png');
  ensureStyles();
  ensureModal();
  scanPosts();

  observer?.disconnect();
  observer = new MutationObserver(() => {
    scanPosts();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function destroyPostButtons(): void {
  observer?.disconnect();
  observer = null;
  activeProfile = null;
  document.querySelectorAll('.lfa-post-toggle, .lfa-post-drawer-btn-wrapper').forEach((element) => element.remove());
  document.querySelectorAll(`[${POST_FLAG}]`).forEach((element) => element.removeAttribute(POST_FLAG));
  document.getElementById(MODAL_ID)?.remove();
}
