import { dispatchFeedMemberAdded } from '../feeds-sidebar/sync-events';
import { handlePendingProfileAction } from '../linkedin-profile-actions';
import { setupProfileContentDomBindings } from './logic/dom-bindings';
import { createFeedActions } from './logic/feed-actions';
import { insertFeedCardIntoPrimaryTopCard, insertFeedCardIntoTopCard } from './logic/feed-card-placement';
import { extractProfileData, findPrimaryProfileTopCardRoot, findProfileTopCardRoot } from './logic/profile-data';
import { injectProfileContentStyles } from './styles';
import { createFeedCard, unmountFeedCard } from './template';
import type { ProfileData } from './types';
import { sendMessageToBackground, showToast } from './utils';
import { hasRelationshipSignal } from '../shared/relationship-dom-signals';
import { getCurrentProfileRelationshipActions } from '../shared/current-profile-relationship-dom';
import { ensureProfileFeedModals } from '../shared/profile-feed-modals';

let feedCardInjected = false;
let currentProfileData: ProfileData | null = null;
let lastUrl = window.location.href;
let cardRemovalObserver: MutationObserver | null = null;
let profileRelationshipObserver: MutationObserver | null = null;
let stickySurfaceObserver: MutationObserver | null = null;
let pendingReinjectTimer: number | null = null;
let pendingRelationshipSyncTimer: number | null = null;
let pendingStickySurfaceFrame: number | null = null;
let stickySurfaceScrollHandler: (() => void) | null = null;
let lastRelationshipSignature = '';

type DispatchedMember = Parameters<typeof dispatchFeedMemberAdded>[0]['member'];

function isBaseProfilePage(pathname: string = window.location.pathname): boolean {
  return /^\/in\/[^/]+\/?$/.test(pathname);
}

function emitFeedMemberAdded(feedId: string, feedName: string, member: unknown): void {
  if (!member || typeof member !== 'object') {
    return;
  }

  dispatchFeedMemberAdded({
    feedId,
    feedName,
    member: member as DispatchedMember,
  });
}

const feedActions = createFeedActions({
  getCurrentProfileData: () => currentProfileData,
  sendMessageToBackground,
  showToast,
  emitFeedMemberAdded,
});

function clearPendingReinject(): void {
  if (pendingReinjectTimer !== null) {
    window.clearTimeout(pendingReinjectTimer);
    pendingReinjectTimer = null;
  }
}

function disconnectCardRemovalObserver(): void {
  if (cardRemovalObserver) {
    cardRemovalObserver.disconnect();
    cardRemovalObserver = null;
  }
}

function disconnectProfileRelationshipObserver(): void {
  if (profileRelationshipObserver) {
    profileRelationshipObserver.disconnect();
    profileRelationshipObserver = null;
  }

  if (pendingRelationshipSyncTimer !== null) {
    window.clearTimeout(pendingRelationshipSyncTimer);
    pendingRelationshipSyncTimer = null;
  }
}

function disconnectStickySurfaceObserver(): void {
  stickySurfaceObserver?.disconnect();
  stickySurfaceObserver = null;

  if (stickySurfaceScrollHandler) {
    window.removeEventListener('scroll', stickySurfaceScrollHandler);
    stickySurfaceScrollHandler = null;
  }

  if (pendingStickySurfaceFrame !== null) {
    window.cancelAnimationFrame(pendingStickySurfaceFrame);
    pendingStickySurfaceFrame = null;
  }
}

function scheduleReinject(): void {
  clearPendingReinject();
  pendingReinjectTimer = window.setTimeout(() => {
    pendingReinjectTimer = null;
    feedCardInjected = false;
    if (isBaseProfilePage()) {
      waitForProfile();
    }
  }, 300);
}

function getRenderedFeedCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-pf-feed-card="true"], #pf-feed-card'));
}

function observeCardRemoval(cards: HTMLElement[]): void {
  disconnectCardRemovalObserver();

  if (cards.length === 0) {
    return;
  }

  cardRemovalObserver = new MutationObserver((_mutations) => {
    if (cards.every((card) => card.isConnected)) {
      return;
    }

    disconnectCardRemovalObserver();
    disconnectStickySurfaceObserver();
    scheduleReinject();
  });

  cardRemovalObserver.observe(document.body, { childList: true, subtree: true });
}

function removeExistingCard(): void {
  disconnectStickySurfaceObserver();
  const existingCards = getRenderedFeedCards();
  if (existingCards.length === 0) {
    return;
  }

  disconnectCardRemovalObserver();
  disconnectProfileRelationshipObserver();
  existingCards.forEach((card) => {
    unmountFeedCard(card);
    card.remove();
  });
}

function getRelationshipDomSignature(root: ParentNode): string {
  const buttons = getCurrentProfileRelationshipActions(root)
    .map((action) => {
      const text = action.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
      const label = (action.getAttribute('aria-label') || action.getAttribute('title') || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      return `${text}|${label}`;
    })
    .filter(
      (value) =>
        hasRelationshipSignal({ text: value, label: '' }) ||
        /connect|invite|pending|withdraw|message|follow|unfollow|встановити|повідомлення|розглядається|скасувати/i.test(
          value
        )
    )
    .sort();
  const degree = root.querySelector('.dist-value')?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
  const premiumBadge = Array.from(root.querySelectorAll<HTMLElement>('*'))
    .map((element) =>
      [
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('type'),
        element.getAttribute('data-test-icon'),
        element.getAttribute('href'),
        element.getAttribute('xlink:href'),
        element.id,
        element.className,
      ]
        .map((value) => String(value || ''))
        .join(' ')
    )
    .some(
      (value) =>
        /\b(?:linkedin\s+premium|premium\s+profile|premium\s+member|profile\s+enhanced\s+with\s+premium)\b/i.test(
          value
        ) || /(?:linkedin-bug|premium-badge|premium_profile|premium-profile)/i.test(value)
    )
    ? 'premium'
    : '';
  return `${degree}::${premiumBadge}::${buttons.join('::')}`;
}

function scheduleProfileRelationshipSync(root: HTMLElement): void {
  const nextSignature = getRelationshipDomSignature(root);
  if (!nextSignature || nextSignature === lastRelationshipSignature) {
    return;
  }

  lastRelationshipSignature = nextSignature;
  if (pendingRelationshipSyncTimer !== null) {
    window.clearTimeout(pendingRelationshipSyncTimer);
  }

  pendingRelationshipSyncTimer = window.setTimeout(() => {
    pendingRelationshipSyncTimer = null;
    void feedActions.syncProfileViewerStatus();
  }, 800);
}

function observeProfileRelationshipChanges(root: HTMLElement): void {
  disconnectProfileRelationshipObserver();
  lastRelationshipSignature = getRelationshipDomSignature(root);

  profileRelationshipObserver = new MutationObserver(() => {
    scheduleProfileRelationshipSync(root);
  });

  profileRelationshipObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'aria-expanded', 'disabled'],
  });
}

function setupEventListeners(): void {
  ensureProfileFeedModals();
  setupProfileContentDomBindings({
    handleAddToFeed: feedActions.handleAddToFeed,
    showCreateFeedOverlay: feedActions.showCreateFeedOverlay,
    refreshCardState: feedActions.refreshCardState,
    getCurrentProfileData: () => currentProfileData,
    sendMessageToBackground,
    showToast,
    emitFeedMemberAdded,
  });
}

function observeMissingStickySurface(profile: ProfileData, primaryTopCard: HTMLElement, cards: HTMLElement[]): void {
  disconnectStickySurfaceObserver();

  const tryInjectStickyCard = () => {
    pendingStickySurfaceFrame = null;
    if (!primaryTopCard.isConnected || !isBaseProfilePage()) {
      return;
    }

    const stickyTopCard = findProfileTopCardRoot(profile.linkedinUsername, primaryTopCard);
    if (!stickyTopCard) {
      return;
    }

    const stickyCard = createFeedCard(profile, false);
    stickyCard.dataset.pfFeedSurface = 'sticky';
    insertFeedCardIntoTopCard(stickyCard, stickyTopCard);
    cards.push(stickyCard);
    setupEventListeners();
    disconnectStickySurfaceObserver();

    void feedActions.checkAuth().then((isAuth) => {
      if (isAuth) {
        void feedActions.refreshCardState();
      }
    });
  };

  const scheduleStickyCheck = () => {
    if (pendingStickySurfaceFrame !== null) {
      return;
    }

    pendingStickySurfaceFrame = window.requestAnimationFrame(tryInjectStickyCard);
  };

  stickySurfaceObserver = new MutationObserver(scheduleStickyCheck);
  stickySurfaceObserver.observe(document.body, { childList: true, subtree: true });
  stickySurfaceScrollHandler = scheduleStickyCheck;
  window.addEventListener('scroll', stickySurfaceScrollHandler, { passive: true });
  scheduleStickyCheck();
}

function injectFeedCard(): void {
  if (feedCardInjected) {
    return;
  }

  const profile = extractProfileData();
  if (!profile || !profile.displayName) {
    return;
  }

  currentProfileData = profile;
  const primaryTopCard = findPrimaryProfileTopCardRoot(profile.linkedinUsername);
  const stickyTopCard = findProfileTopCardRoot(profile.linkedinUsername, primaryTopCard);
  if (!primaryTopCard && !stickyTopCard) {
    return;
  }

  removeExistingCard();

  injectProfileContentStyles();
  const cards: HTMLElement[] = [];

  if (primaryTopCard) {
    const primaryCard = createFeedCard(profile);
    primaryCard.dataset.pfFeedSurface = 'primary';
    insertFeedCardIntoPrimaryTopCard(primaryCard, primaryTopCard);
    cards.push(primaryCard);
  }

  if (stickyTopCard) {
    const stickyCard = createFeedCard(profile, cards.length === 0);
    stickyCard.dataset.pfFeedSurface = 'sticky';
    insertFeedCardIntoTopCard(stickyCard, stickyTopCard);
    cards.push(stickyCard);
  }

  feedCardInjected = true;
  clearPendingReinject();
  observeCardRemoval(cards);
  observeProfileRelationshipChanges(primaryTopCard || stickyTopCard!);
  setupEventListeners();

  if (primaryTopCard && !stickyTopCard) {
    observeMissingStickySurface(profile, primaryTopCard, cards);
  }

  void feedActions.checkAuth().then((isAuth) => {
    if (isAuth) {
      void feedActions.refreshCardState();
    }
  });
}

function waitForProfile(): void {
  if (!isBaseProfilePage()) {
    return;
  }

  if (findPrimaryProfileTopCardRoot() || findProfileTopCardRoot()) {
    injectFeedCard();
    return;
  }

  const observer = new MutationObserver((_mutations, obs) => {
    if (findPrimaryProfileTopCardRoot() || findProfileTopCardRoot()) {
      obs.disconnect();
      injectFeedCard();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}

function handleNavigation(): void {
  const checkUrl = () => {
    if (window.location.href === lastUrl) {
      return;
    }
    lastUrl = window.location.href;
    removeExistingCard();
    clearPendingReinject();
    disconnectProfileRelationshipObserver();
    feedCardInjected = false;
    currentProfileData = null;

    if (isBaseProfilePage()) {
      setTimeout(waitForProfile, 500);
    }
  };

  setInterval(checkUrl, 1000);
}

if (isBaseProfilePage()) {
  waitForProfile();
}
handleNavigation();
handlePendingProfileAction();
