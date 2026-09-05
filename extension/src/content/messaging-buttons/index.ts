import { CONTENT_COPY } from '../shared/copy';
import { showToast } from '../shared/toast';
import { openProfileFeedPicker } from '../post-buttons/public';
import { findMessagingProfileTargets, isLinkedInMessagingRoute } from './logic/profile-card';
import { MESSAGING_BUTTONS_CSS } from './styles';

const STYLE_ID = 'lfa-messaging-buttons-styles';
const WRAPPER_CLASS = 'lfa-messaging-feed-btn-wrapper';
const BOUND_ATTRIBUTE = 'data-lfa-messaging-feed-bound';
const PROFILE_KEY_ATTRIBUTE = 'data-lfa-messaging-profile-key';
const CONTROL_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'click'] as const;
const SCAN_DELAY_MS = 25;
const ROUTE_WATCH_INTERVAL_MS = 400;

let observer: MutationObserver | null = null;
let scanTimer: number | null = null;
let routeWatchTimer: number | null = null;
let lastObservedUrl = '';
let lastScanDiagnostic = '';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = MESSAGING_BUTTONS_CSS;
  document.head.appendChild(style);
}

function stopLinkedInNavigation(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function buildButton(onClick: () => void): HTMLSpanElement {
  const wrapper = document.createElement('span');
  wrapper.className = WRAPPER_CLASS;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lfa-messaging-feed-btn';
  button.title = CONTENT_COPY.postButtons.buttonAria;
  button.setAttribute('aria-label', CONTENT_COPY.postButtons.buttonAria);
  button.innerHTML = `
    <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="" width="12" height="12" />
    <span>${CONTENT_COPY.postButtons.drawerLabel}</span>
  `;

  CONTROL_EVENTS.forEach((eventName) => {
    button.addEventListener(
      eventName,
      (event) => {
        stopLinkedInNavigation(event);
        if (eventName === 'click') onClick();
      },
      { capture: true }
    );
  });

  wrapper.appendChild(button);
  return wrapper;
}

function removeInjectedMessagingButtons(): void {
  document.querySelectorAll(`.${WRAPPER_CLASS}`).forEach((element) => element.remove());
  document.querySelectorAll(`[${BOUND_ATTRIBUTE}]`).forEach((element) => element.removeAttribute(BOUND_ATTRIBUTE));
}

function getAttachedWrappers(degreeElement: HTMLElement): HTMLElement[] {
  const wrappers = Array.from(degreeElement.children).filter((element): element is HTMLElement =>
    element.classList.contains(WRAPPER_CLASS)
  );
  const sibling = degreeElement.nextElementSibling;
  if (sibling instanceof HTMLElement && sibling.classList.contains(WRAPPER_CLASS)) {
    wrappers.push(sibling);
  }
  return wrappers;
}

function removeOrphanedMessagingButtons(): void {
  document.querySelectorAll<HTMLElement>(`.${WRAPPER_CLASS}`).forEach((wrapper) => {
    const profileKey = wrapper.getAttribute(PROFILE_KEY_ATTRIBUTE);
    const siblingTarget = wrapper.previousElementSibling;
    const parentTarget = wrapper.parentElement;
    const hasSiblingTarget = siblingTarget?.getAttribute(BOUND_ATTRIBUTE) === profileKey;
    const hasParentTarget = parentTarget?.getAttribute(BOUND_ATTRIBUTE) === profileKey;

    if (!profileKey || (!hasSiblingTarget && !hasParentTarget)) {
      wrapper.remove();
    }
  });
}

function removeDuplicateProfileBindings(
  profileKey: string,
  degreeElement: HTMLElement,
  attachedWrappers: HTMLElement[]
): void {
  document.querySelectorAll<HTMLElement>(`.${WRAPPER_CLASS}`).forEach((wrapper) => {
    if (wrapper.getAttribute(PROFILE_KEY_ATTRIBUTE) === profileKey && !attachedWrappers.includes(wrapper)) {
      wrapper.remove();
    }
  });

  document.querySelectorAll<HTMLElement>(`[${BOUND_ATTRIBUTE}]`).forEach((element) => {
    if (element !== degreeElement && element.getAttribute(BOUND_ATTRIBUTE) === profileKey) {
      element.removeAttribute(BOUND_ATTRIBUTE);
    }
  });
}

function injectMessagingButtons(): void {
  if (!isLinkedInMessagingRoute(window.location.pathname)) {
    removeInjectedMessagingButtons();
    return;
  }

  removeOrphanedMessagingButtons();

  const targets = findMessagingProfileTargets(document);
  const diagnostic = JSON.stringify({
    pathname: window.location.pathname,
    profileCards: document.querySelectorAll('.msg-s-profile-card').length,
    targets: targets.length,
  });
  if (diagnostic !== lastScanDiagnostic) {
    lastScanDiagnostic = diagnostic;
    console.info('[messaging-buttons] Scan', JSON.parse(diagnostic));
  }

  targets.forEach(({ degreeElement, insertPosition, profile }) => {
    const profileKey = profile.linkedinUsername.toLowerCase();
    const existingProfileKey = degreeElement.getAttribute(BOUND_ATTRIBUTE);
    const attachedWrappers = getAttachedWrappers(degreeElement);
    removeDuplicateProfileBindings(profileKey, degreeElement, attachedWrappers);
    const existingWrapper = attachedWrappers.find(
      (wrapper) => wrapper.getAttribute(PROFILE_KEY_ATTRIBUTE) === profileKey
    );

    if (existingProfileKey === profileKey && existingWrapper) return;
    attachedWrappers.forEach((wrapper) => wrapper.remove());

    const wrapper = buildButton(() => {
      void openProfileFeedPicker(profile).catch((error) => {
        showToast(error instanceof Error ? error.message : CONTENT_COPY.postButtons.failedToOpenFeeds, 'error');
      });
    });
    wrapper.setAttribute(PROFILE_KEY_ATTRIBUTE, profileKey);
    degreeElement.insertAdjacentElement(insertPosition, wrapper);
    degreeElement.setAttribute(BOUND_ATTRIBUTE, profileKey);
  });
}

function scheduleScan(): void {
  if (scanTimer !== null) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    injectMessagingButtons();
  }, SCAN_DELAY_MS);
}

function startRouteWatcher(): void {
  if (routeWatchTimer !== null) return;

  lastObservedUrl = window.location.href;
  routeWatchTimer = window.setInterval(() => {
    const currentUrl = window.location.href;
    const routeChanged = currentUrl !== lastObservedUrl;
    lastObservedUrl = currentUrl;

    // LinkedIn can finish rendering a conversation without adding another
    // child node visible to our observer. Keep the Messaging integration
    // self-healing while that surface is open, as well as after URL changes.
    if (routeChanged || isLinkedInMessagingRoute(window.location.pathname)) {
      scheduleScan();
    }
  }, ROUTE_WATCH_INTERVAL_MS);
}

export function initMessagingButtons(): void {
  ensureStyles();
  injectMessagingButtons();
  startRouteWatcher();
  if (!observer) {
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href', 'aria-label', 'title', 'data-view-name', 'data-test-id'],
    });
  }
}

export function destroyMessagingButtons(): void {
  observer?.disconnect();
  observer = null;
  if (scanTimer !== null) {
    window.clearTimeout(scanTimer);
    scanTimer = null;
  }
  if (routeWatchTimer !== null) {
    window.clearInterval(routeWatchTimer);
    routeWatchTimer = null;
  }
  lastObservedUrl = '';
  lastScanDiagnostic = '';
  removeInjectedMessagingButtons();
}
