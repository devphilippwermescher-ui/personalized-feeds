import { CONTENT_COPY } from '../../shared/copy';
import { showToast } from '../../shared/toast';
import type { PostAuthorProfile } from '../../post-buttons/public';
import { isLinkedInMessagingRoute } from '../logic/profile-card';
import { MESSAGING_BUTTONS_CSS } from '../styles';
import { findMessagingDrawerProfileTargets } from './profile-card';

const STYLE_ID = 'lfa-messaging-drawer-buttons-styles';
const WRAPPER_CLASS = 'lfa-messaging-drawer-feed-btn-wrapper';
const PROFILE_KEY_ATTRIBUTE = 'data-lfa-messaging-drawer-profile-key';
const SCAN_INTERVAL_MS = 750;
const CONTROL_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'click'] as const;

type MessagingDrawerRoot = Document | ShadowRoot;

const rootObservers = new Map<MessagingDrawerRoot, MutationObserver>();
let scanTimer: number | null = null;
let scanInterval: number | null = null;
let lastDiagnostic = '';
let openDrawerProfileFeedPicker: (profile: PostAuthorProfile) => Promise<void> = async () => {
  throw new Error(CONTENT_COPY.postButtons.failedToOpenFeeds);
};

function isDrawerSurfaceActive(): boolean {
  return !isLinkedInMessagingRoute(window.location.pathname);
}

function isDocumentRoot(root: MessagingDrawerRoot): root is Document {
  return root.nodeType === Node.DOCUMENT_NODE;
}

function isOpenShadowRoot(value: unknown): value is ShadowRoot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ShadowRoot>;
  return candidate.nodeType === Node.DOCUMENT_FRAGMENT_NODE && Boolean(candidate.host) && candidate.mode === 'open';
}

function getRootDocument(root: MessagingDrawerRoot): Document {
  return isDocumentRoot(root) ? root : root.ownerDocument;
}

function getReachableRoots(): MessagingDrawerRoot[] {
  const roots: MessagingDrawerRoot[] = [];
  const seen = new Set<MessagingDrawerRoot>();

  const visit = (root: MessagingDrawerRoot): void => {
    if (seen.has(root)) return;
    seen.add(root);
    roots.push(root);

    root.querySelectorAll<HTMLElement>('*').forEach((element) => {
      if (isOpenShadowRoot(element.shadowRoot)) visit(element.shadowRoot);
    });

    root.querySelectorAll<HTMLIFrameElement>('iframe').forEach((frame) => {
      try {
        if (frame.contentDocument) visit(frame.contentDocument);
      } catch {
        // Cross-origin and sandboxed frames are intentionally ignored.
      }
    });
  };

  visit(document);
  return roots;
}

function ensureStyles(root: MessagingDrawerRoot): void {
  if (root.querySelector(`#${STYLE_ID}`)) return;

  const targetDocument = getRootDocument(root);
  const style = targetDocument.createElement('style');
  style.id = STYLE_ID;
  style.textContent = MESSAGING_BUTTONS_CSS.split('.lfa-messaging-feed-btn-wrapper').join(`.${WRAPPER_CLASS}`);
  if (isDocumentRoot(root)) {
    (root.head || root.documentElement).appendChild(style);
  } else {
    root.prepend(style);
  }
}

function stopLinkedInNavigation(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function buildButton(targetDocument: Document, profile: PostAuthorProfile): HTMLSpanElement {
  const wrapper = targetDocument.createElement('span');
  wrapper.className = WRAPPER_CLASS;
  wrapper.setAttribute(PROFILE_KEY_ATTRIBUTE, profile.linkedinUsername.toLowerCase());

  const button = targetDocument.createElement('button');
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
        if (eventName === 'click') {
          void openDrawerProfileFeedPicker(profile).catch((error) => {
            showToast(error instanceof Error ? error.message : CONTENT_COPY.postButtons.failedToOpenFeeds, 'error');
          });
        }
      },
      { capture: true }
    );
  });

  wrapper.appendChild(button);
  return wrapper;
}

function isRendered(element: HTMLElement): boolean {
  if (!element.isConnected) return false;

  const view = element.ownerDocument.defaultView;
  let current: HTMLElement | null = element;
  while (current) {
    const style = view?.getComputedStyle(current);
    if (current.hidden || style?.display === 'none' || style?.visibility === 'hidden') return false;

    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }

    const root = current.getRootNode();
    current = isOpenShadowRoot(root) && root.host.nodeType === Node.ELEMENT_NODE ? (root.host as HTMLElement) : null;
  }

  return true;
}

function removeDrawerButtons(root: MessagingDrawerRoot): void {
  root.querySelectorAll(`.${WRAPPER_CLASS}`).forEach((wrapper) => wrapper.remove());
}

function scanRoot(root: MessagingDrawerRoot): number {
  const targetDocument = getRootDocument(root);
  const targets = findMessagingDrawerProfileTargets(root).filter(({ identityRow }) => isRendered(identityRow));
  if (targets.length > 0) ensureStyles(root);
  const activeCards = new Set(targets.map(({ cardElement }) => cardElement));

  root.querySelectorAll<HTMLElement>(`.${WRAPPER_CLASS}`).forEach((wrapper) => {
    if (!Array.from(activeCards).some((card) => card.contains(wrapper))) wrapper.remove();
  });

  targets.forEach(({ cardElement, identityRow, profile }) => {
    const profileKey = profile.linkedinUsername.toLowerCase();
    const existingWrappers = Array.from(cardElement.querySelectorAll<HTMLElement>(`.${WRAPPER_CLASS}`));
    const matchingWrapper = existingWrappers.find(
      (wrapper) => wrapper.getAttribute(PROFILE_KEY_ATTRIBUTE) === profileKey
    );

    existingWrappers.forEach((wrapper) => {
      if (wrapper !== matchingWrapper) wrapper.remove();
    });
    if (matchingWrapper && matchingWrapper.parentElement === identityRow) return;
    matchingWrapper?.remove();
    identityRow.appendChild(buildButton(targetDocument, profile));
  });

  return targets.length;
}

function observeRoot(root: MessagingDrawerRoot): void {
  if (rootObservers.has(root)) return;

  const targetDocument = getRootDocument(root);
  const Observer = targetDocument.defaultView?.MutationObserver || MutationObserver;
  const observer = new Observer(scheduleDrawerScan);
  observer.observe(isDocumentRoot(root) ? root.documentElement : root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href', 'class', 'aria-label', 'style', 'hidden'],
  });
  rootObservers.set(root, observer);
}

function scanDrawerSurfaces(): void {
  scanTimer = null;
  const reachableRoots = getReachableRoots();
  const reachableRootSet = new Set(reachableRoots);

  rootObservers.forEach((observer, root) => {
    if (reachableRootSet.has(root)) return;
    observer.disconnect();
    removeDrawerButtons(root);
    rootObservers.delete(root);
  });

  if (!isDrawerSurfaceActive()) {
    reachableRoots.forEach(removeDrawerButtons);
    return;
  }

  let targetCount = 0;
  reachableRoots.forEach((root) => {
    observeRoot(root);
    targetCount += scanRoot(root);
  });

  const reachableDocuments = reachableRoots.filter(isDocumentRoot).length;
  const diagnostic = JSON.stringify({
    pathname: window.location.pathname,
    reachableDocuments,
    openShadowRoots: reachableRoots.length - reachableDocuments,
    profileCards: reachableRoots.reduce(
      (count, root) => count + root.querySelectorAll('.msg-s-profile-card').length,
      0
    ),
    targets: targetCount,
  });
  if (diagnostic !== lastDiagnostic) {
    lastDiagnostic = diagnostic;
    console.info('[messaging-drawer-buttons] Scan', JSON.parse(diagnostic));
  }
}

function scheduleDrawerScan(): void {
  if (scanTimer !== null) return;
  scanTimer = window.setTimeout(scanDrawerSurfaces, 25);
}

export function initMessagingDrawerButtons(openProfileFeedPicker: (profile: PostAuthorProfile) => Promise<void>): void {
  openDrawerProfileFeedPicker = openProfileFeedPicker;
  scanDrawerSurfaces();
  if (scanInterval === null) {
    scanInterval = window.setInterval(scanDrawerSurfaces, SCAN_INTERVAL_MS);
  }
}

export function destroyMessagingDrawerButtons(): void {
  if (scanTimer !== null) {
    window.clearTimeout(scanTimer);
    scanTimer = null;
  }
  if (scanInterval !== null) {
    window.clearInterval(scanInterval);
    scanInterval = null;
  }
  rootObservers.forEach((observer, root) => {
    observer.disconnect();
    removeDrawerButtons(root);
  });
  rootObservers.clear();
  lastDiagnostic = '';
}
