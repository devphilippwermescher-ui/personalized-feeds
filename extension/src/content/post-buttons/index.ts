import { POST_BUTTONS_CSS } from './styles';
import { CONTENT_COPY } from '../shared/copy';
import type { FeedSummary, PostAuthorProfile } from './types';
import { feedAddedMessage, feedCreatedAndProfileAddedMessage, feedCreatedButProfileAddFailedMessage, profileAlreadyInFeedMessage } from '../shared/toast-messages';
import { showToast } from '../shared/toast';
import { extractPostAuthorProfile, findPostAuthorDrawerHost, findPostCandidates } from './utils';
import { dispatchFeedMemberAdded } from '../feeds-sidebar/sync-events';
import type { FeedMemberInfo } from '../feeds-sidebar/types';
import { enrichProfileDataForFeed } from '../shared/enrich-profile-data';
import {
  ensureProfileFeedModals,
  getCreateFeedModalElements,
  getSelectedCreateFeedColor,
  renderFeedModalEmpty,
  renderFeedModalLoading,
  renderFeedModalOption,
  resetCreateFeedModalFields,
  setProfileFeedModalContext,
} from '../shared/profile-feed-modals';
import { injectSharedStyles } from '../../shared/ui';

const POST_FLAG = 'data-lfa-post-buttons-bound';
const STYLE_ID = 'lfa-post-buttons-styles';
const MODAL_ID = 'pf-feed-modal-overlay';
const CREATE_MODAL_ID = 'pf-create-feed-overlay';
const DRAWER_ID = 'lfa-post-drawer-btn';
const POST_CONTROL_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'click'] as const;

let observer: MutationObserver | null = null;
let scanTimer: number | null = null;
let iconUrl = '';
let activeProfile: PostAuthorProfile | null = null;
let globalPostControlEventsBound = false;
let createFeedSubmitInFlight = false;
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

  injectSharedStyles();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = POST_BUTTONS_CSS;
  document.head.appendChild(style);
}

function ensureModal(): HTMLDivElement {
  ensureProfileFeedModals();

  const overlay = document.getElementById(MODAL_ID) as HTMLDivElement | null;
  const createButton = document.getElementById('pf-feed-modal-create');
  if (createButton && createButton.getAttribute('data-post-create-feed-bound') !== 'true') {
    createButton.addEventListener('click', () => {
      if (overlay?.dataset.feedModalContext !== 'post') {
        return;
      }
      openCreateFeedModal();
    });
    createButton.setAttribute('data-post-create-feed-bound', 'true');
  }

  if (!overlay) {
    throw new Error('Feed modal is unavailable');
  }
  return overlay;
}

function ensureCreateFeedModal(): HTMLDivElement {
  ensureProfileFeedModals();

  const overlay = document.getElementById(CREATE_MODAL_ID) as HTMLDivElement | null;
  if (!overlay) {
    throw new Error('Create feed modal is unavailable');
  }

  bindCreateFeedModal(overlay);
  return overlay;
}

async function getFeeds(): Promise<FeedSummary[]> {
  const response = await sendMessage<{ success: boolean; feeds?: FeedSummary[]; error?: string }>({ type: 'FEEDS_GET_ALL' });
  if (!response?.success) {
    throw new Error(response?.error || 'Failed to load feeds');
  }
  return response.feeds || [];
}

async function createFeed(name: string, color: string, description = ''): Promise<FeedSummary> {
  const response = await sendMessage<{ success: boolean; feed?: FeedSummary; error?: string }>({
    type: 'FEEDS_CREATE',
    name,
    description,
    color,
  });
  if (!response?.success || !response.feed) {
    throw new Error(response?.error || 'Failed to create feed');
  }
  return response.feed;
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

function renderFeedOptions(feeds: FeedSummary[], memberships: Map<string, string>): string {
  if (feeds.length === 0) {
    return renderFeedModalEmpty(CONTENT_COPY.postButtons.noFeedsTitle, CONTENT_COPY.profile.noFeedsHint);
  }

  return feeds
    .map((feed) => {
      return renderFeedModalOption({
        id: feed.id,
        name: feed.name,
        color: feed.color,
        memberCount: feed.memberCount,
        isMember: memberships.has(feed.id),
        element: 'button',
      });
    })
    .join('');
}

function resetCreateFeedModal(overlay: HTMLElement): void {
  resetCreateFeedModalFields(overlay);
}

function openCreateFeedModal(): void {
  const feedOverlay = document.getElementById(MODAL_ID);
  const overlay = ensureCreateFeedModal();
  feedOverlay?.style.setProperty('display', 'none');
  setProfileFeedModalContext(overlay, 'post');
  resetCreateFeedModal(overlay);
  overlay.style.display = 'flex';
  window.setTimeout(() => {
    getCreateFeedModalElements()?.nameInput.focus();
  }, 80);
}

function bindCreateFeedModal(overlay: HTMLElement): void {
  if (overlay.getAttribute('data-post-create-feed-submit-bound') === 'true') {
    return;
  }

  const elements = getCreateFeedModalElements();
  if (!elements) {
    return;
  }
  const { nameInput, descriptionInput, submitButton } = elements;

  overlay.querySelectorAll<HTMLElement>('.pf-color-option').forEach((button) => {
    button.addEventListener('click', () => {
      overlay.querySelectorAll<HTMLElement>('.pf-color-option').forEach((colorButton) => {
        const isSelected = colorButton === button;
        colorButton.classList.toggle('active', isSelected);
      });
    });
  });

  submitButton.addEventListener('click', async (event) => {
    event.preventDefault();
    if (overlay.dataset.feedModalContext !== 'post' || !activeProfile || createFeedSubmitInFlight) {
      return;
    }

    const feedName = nameInput.value.trim();
    if (!feedName) {
      showToast('Enter a feed name', 'error');
      nameInput.focus();
      return;
    }

    createFeedSubmitInFlight = true;
    submitButton.disabled = true;
    nameInput.disabled = true;
    descriptionInput.disabled = true;
    submitButton.textContent = CONTENT_COPY.profile.creatingFeedSubmit;
    let createdFeedName = '';
    try {
      const feed = await createFeed(feedName, getSelectedCreateFeedColor(), descriptionInput.value.trim());
      createdFeedName = feed.name;
      submitButton.textContent = CONTENT_COPY.profile.addToFeedSubmitting;
      const added = await addProfileToFeed(feed.id, feed.name, activeProfile);
      overlay.style.display = 'none';
      showToast(
        added
          ? feedCreatedAndProfileAddedMessage(feed.name)
          : profileAlreadyInFeedMessage(activeProfile.displayName, feed.name),
        added ? 'success' : 'error'
      );
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Failed to create feed';
      showToast(createdFeedName ? feedCreatedButProfileAddFailedMessage(createdFeedName) : message, 'error');
      submitButton.disabled = false;
      nameInput.disabled = false;
      descriptionInput.disabled = false;
      submitButton.textContent = CONTENT_COPY.profile.createFeedSubmit;
    } finally {
      createFeedSubmitInFlight = false;
    }
  });
  overlay.setAttribute('data-post-create-feed-submit-bound', 'true');
}

async function openFeedModal(profile: PostAuthorProfile, feeds: FeedSummary[]): Promise<void> {
  const overlay = ensureModal();
  const body = overlay.querySelector<HTMLElement>('#pf-feed-modal-body');
  if (!body) {
    return;
  }

  activeProfile = profile;
  setProfileFeedModalContext(overlay, 'post');
  body.innerHTML = renderFeedModalLoading(CONTENT_COPY.postButtons.loadingFeeds, true);
  overlay.style.display = 'flex';

  const enrichedProfile = await enrichPostProfile(profile);
  activeProfile = enrichedProfile;

  const memberships = await getMemberships(enrichedProfile);

  body.innerHTML = `
    ${renderFeedOptions(feeds, memberships)}
  `;

  body.querySelectorAll<HTMLButtonElement>('.pf-feed-option:not(.already-added)').forEach((button) => {
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
  if (event.target instanceof Element && event.target.closest(`#${MODAL_ID}, #${CREATE_MODAL_ID}`)) {
    return null;
  }

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

  post.querySelectorAll('.lfa-post-toggle').forEach((element) => element.remove());
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
}
