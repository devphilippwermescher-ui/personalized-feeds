import { POST_BUTTONS_CSS } from './styles';
import { CONTENT_COPY, getMemberCountLabel } from '../shared/copy';
import type { FeedSummary, PostAuthorProfile } from './types';
import { feedAddedMessage, profileAlreadyInFeedMessage } from '../shared/toast-messages';
import { showToast } from '../shared/toast';
import { escapeHtml, extractPostAuthorProfile, findPostAuthorDrawerHost, findPostCandidates } from './utils';
import { dispatchFeedMemberAdded } from '../feeds-sidebar/sync-events';
import type { FeedMemberInfo } from '../feeds-sidebar/types';
import { enrichProfileDataForFeed } from '../shared/enrich-profile-data';

const POST_FLAG = 'data-lfa-post-buttons-bound';
const STYLE_ID = 'lfa-post-buttons-styles';
const MODAL_ID = 'lfa-post-feed-modal-overlay';
const TOGGLE_ID = 'lfa-post-toggle-btn';
const DRAWER_ID = 'lfa-post-drawer-btn';
const POST_CONTROL_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'click'] as const;

let observer: MutationObserver | null = null;
let scanTimer: number | null = null;
let iconUrl = '';
let activeProfile: PostAuthorProfile | null = null;
let globalPostControlEventsBound = false;
const postControlProfiles = new WeakMap<HTMLElement, PostAuthorProfile>();

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

async function enrichPostProfile(profile: PostAuthorProfile): Promise<PostAuthorProfile> {
  const enriched = await enrichProfileDataForFeed(profile);
  return {
    ...profile,
    ...enriched,
    memberId: enriched.memberNumericId || enriched.memberId || profile.memberId,
  };
}

async function getMemberships(profile: PostAuthorProfile): Promise<Map<string, string>> {
  const response = await sendMessage<{ memberships?: Array<{ feedId: string; memberId: string }> }>({
    type: 'FEEDS_GET_PROFILE_MEMBERSHIPS',
    linkedinUsername: profile.linkedinUsername,
    linkedinUrl: profile.linkedinUrl,
    memberNumericId: profile.memberNumericId || profile.memberId,
    profileUrn: profile.profileUrn,
  });

  return new Map((response?.memberships || []).map((membership) => [membership.feedId, membership.memberId]));
}

async function addProfileToFeed(feedId: string, feedName: string, profile: PostAuthorProfile): Promise<boolean> {
  const enrichedProfile = await enrichPostProfile(profile);
  const response = await sendMessage<{
    success: boolean;
    error?: string;
    alreadyExists?: boolean;
    member?: FeedMemberInfo;
  }>({
    type: 'FEEDS_ADD_MEMBER',
    feedId,
    profileData: enrichedProfile,
  });

  if (!response?.success) {
    throw new Error(response?.error || `Failed to add to "${feedName}"`);
  }

  const added = response.alreadyExists !== true;
  if (added && response.member) {
    dispatchFeedMemberAdded({
      feedId,
      feedName,
      member: response.member,
    });
  }

  return added;
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

  const enrichedProfile = await enrichPostProfile(profile);
  activeProfile = enrichedProfile;
  subtitle.innerHTML = CONTENT_COPY.postButtons.authorAddSubtitle(escapeHtml(enrichedProfile.displayName));

  const memberships = await getMemberships(enrichedProfile);

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

function stopLinkedInNavigation(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }
}

function findPostControlFromEvent(event: Event): HTMLElement | null {
  const targetControl = event.target instanceof Element
    ? event.target.closest<HTMLElement>('[data-lfa-post-control]')
    : null;
  if (targetControl) {
    return targetControl;
  }

  const pointerEvent = event as MouseEvent;
  if (typeof pointerEvent.clientX !== 'number' || typeof pointerEvent.clientY !== 'number') {
    return null;
  }

  const controls = Array.from(document.querySelectorAll<HTMLElement>('[data-lfa-post-control]')).reverse();
  return controls.find((control) => {
    const rect = control.getBoundingClientRect();
    return (
      pointerEvent.clientX >= rect.left &&
      pointerEvent.clientX <= rect.right &&
      pointerEvent.clientY >= rect.top &&
      pointerEvent.clientY <= rect.bottom
    );
  }) || null;
}

function handleGlobalPostControlEvent(event: Event): void {
  const control = findPostControlFromEvent(event);
  if (!control) {
    return;
  }

  stopLinkedInNavigation(event);

  if (event.type !== 'click') {
    return;
  }

  const profile = postControlProfiles.get(control);
  if (!profile) {
    showToast(CONTENT_COPY.postButtons.failedToOpenFeeds, 'error');
    return;
  }

  void handlePostButtonClick(profile).catch((error) => {
    showToast(error instanceof Error ? error.message : CONTENT_COPY.postButtons.failedToOpenFeeds, 'error');
  });
}

function ensureGlobalPostControlEvents(): void {
  if (globalPostControlEventsBound) {
    return;
  }

  POST_CONTROL_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, handleGlobalPostControlEvent, { capture: true });
  });
  globalPostControlEventsBound = true;
}

function removeGlobalPostControlEvents(): void {
  if (!globalPostControlEventsBound) {
    return;
  }

  POST_CONTROL_EVENTS.forEach((eventName) => {
    window.removeEventListener(eventName, handleGlobalPostControlEvent, true);
  });
  globalPostControlEventsBound = false;
}

function bindPostControlButton(button: HTMLButtonElement, profile: PostAuthorProfile): void {
  postControlProfiles.set(button, profile);

  POST_CONTROL_EVENTS.forEach((eventName) => {
    button.addEventListener(eventName, stopLinkedInNavigation, { capture: true });
  });
}

function injectButtonsIntoPost(post: HTMLElement): void {
  const profile = extractPostAuthorProfile(post);
  if (!profile) {
    return;
  }

  const profileKey = profile.linkedinUsername.toLowerCase();
  const previousProfileKey = post.getAttribute(POST_FLAG);
  if (previousProfileKey && previousProfileKey !== profileKey) {
    post.querySelectorAll('.lfa-post-toggle, .lfa-post-drawer-btn-wrapper').forEach((element) => element.remove());
  }
  post.setAttribute(POST_FLAG, profileKey);

  const drawerHost = findPostAuthorDrawerHost(post);
  if (drawerHost && !post.querySelector('.lfa-post-drawer-btn-wrapper')) {
    const wrapper = document.createElement('span');
    wrapper.className = 'lfa-post-drawer-btn-wrapper';
    const drawerButton = buildDrawerButton();
    drawerButton.dataset.lfaPostControl = DRAWER_ID;
    bindPostControlButton(drawerButton, profile);
    wrapper.appendChild(drawerButton);
    drawerHost.appendChild(wrapper);
  }

  if (!post.querySelector('.lfa-post-toggle')) {
    if (window.getComputedStyle(post).position === 'static') {
      post.style.position = 'relative';
    }
    post.style.overflow = 'visible';
    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'lfa-post-toggle';
    const toggleButton = buildToggleButton();
    toggleButton.dataset.lfaPostControl = TOGGLE_ID;
    bindPostControlButton(toggleButton, profile);
    toggleWrap.appendChild(toggleButton);
    post.appendChild(toggleWrap);
  }
}

function scanPosts(): void {
  findPostCandidates(document).forEach(injectButtonsIntoPost);
}

function schedulePostScan(): void {
  if (scanTimer !== null) {
    return;
  }

  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scanPosts();
  }, 75);
}

export function initPostButtons(): void {
  iconUrl = chrome.runtime.getURL('icons/icon48.png');
  ensureStyles();
  ensureModal();
  ensureGlobalPostControlEvents();
  scanPosts();

  observer?.disconnect();
  observer = new MutationObserver(() => {
    schedulePostScan();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function destroyPostButtons(): void {
  observer?.disconnect();
  observer = null;
  if (scanTimer !== null) {
    window.clearTimeout(scanTimer);
    scanTimer = null;
  }
  activeProfile = null;
  removeGlobalPostControlEvents();
  document.querySelectorAll('.lfa-post-toggle, .lfa-post-drawer-btn-wrapper').forEach((element) => element.remove());
  document.querySelectorAll(`[${POST_FLAG}]`).forEach((element) => element.removeAttribute(POST_FLAG));
  document.getElementById(MODAL_ID)?.remove();
}
