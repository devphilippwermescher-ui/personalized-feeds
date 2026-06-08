import { dispatchFeedMemberAdded } from '../feeds-sidebar/sync-events';
import { handlePendingProfileAction } from '../linkedin-profile-actions';
import { setupProfileContentDomBindings } from './logic/dom-bindings';
import { createFeedActions } from './logic/feed-actions';
import { extractProfileData, findProfileTopCardRoot } from './logic/profile-data';
import { injectProfileContentStyles } from './styles';
import { createFeedCard, unmountFeedCard } from './template';
import type { ProfileData } from './types';
import { sendMessageToBackground, showToast } from './utils';

let feedCardInjected = false;
let currentProfileData: ProfileData | null = null;
let lastUrl = window.location.href;
let cardRemovalObserver: MutationObserver | null = null;
let pendingReinjectTimer: number | null = null;

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

function getModernProfileActionElements(root: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href*="/preload/custom-invite/"]',
    'a[href*="/messaging/compose/"]',
    'button[aria-label*="Message"]',
    'button[aria-label*="Connect"]',
    'button[aria-label*="Invite"]',
    'button[aria-label*="Pending"]',
    'button[aria-expanded="false"]',
  ];

  const elements = selectors.flatMap((selector) => Array.from(root.querySelectorAll<HTMLElement>(selector)));
  return Array.from(new Set(elements));
}

function countModernProfileActionElements(root: ParentNode): number {
  return getModernProfileActionElements(root as HTMLElement).filter((element) => root.contains(element)).length;
}

function findModernActionBarContainer(root: HTMLElement): HTMLElement | null {
  const actions = getModernProfileActionElements(root);
  for (const action of actions) {
    let current = action.parentElement;

    while (current && current !== root) {
      if (countModernProfileActionElements(current) >= 2) {
        return current;
      }
      current = current.parentElement;
    }
  }

  return null;
}

function isModernTopCardSection(element: HTMLElement): boolean {
  const componentKey = element.getAttribute('componentkey') || '';
  return /topcard/i.test(componentKey);
}

function findModernInlineInsertionTarget(root: HTMLElement): HTMLElement | null {
  const mutualConnectionsLink = root.querySelector<HTMLElement>(
    'a[href*="/search/results/people/"][href*="connectionOf="]'
  );
  if (mutualConnectionsLink?.parentElement === root) {
    return mutualConnectionsLink;
  }

  const modernActionBar = findModernActionBarContainer(root);
  if (!modernActionBar) {
    return null;
  }

  let current: HTMLElement | null = modernActionBar;
  while (current?.parentElement && current.parentElement !== root) {
    current = current.parentElement;
  }

  return current && current.parentElement === root ? current : modernActionBar;
}

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

function observeCardRemoval(card: HTMLElement): void {
  disconnectCardRemovalObserver();

  const parent = card.parentElement;
  if (!parent) {
    return;
  }

  cardRemovalObserver = new MutationObserver((_mutations) => {
    const cardStillConnected = document.getElementById('pf-feed-card')?.isConnected === true;
    if (cardStillConnected) {
      return;
    }

    disconnectCardRemovalObserver();
    scheduleReinject();
  });

  cardRemovalObserver.observe(document.body, { childList: true, subtree: true });
}

function removeExistingCard(): void {
  const existingCard = document.getElementById('pf-feed-card');
  if (!existingCard) {
    return;
  }

  disconnectCardRemovalObserver();
  unmountFeedCard(existingCard);
  existingCard.remove();
}

function setupEventListeners(): void {
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

function injectFeedCard(): void {
  if (feedCardInjected) {
    return;
  }

  const profile = extractProfileData();
  if (!profile || !profile.displayName) {
    return;
  }

  currentProfileData = profile;
  const topCardSection = findProfileTopCardRoot(profile.linkedinUsername);
  if (!topCardSection) {
    return;
  }

  removeExistingCard();

  injectProfileContentStyles();
  const card = createFeedCard(profile);
  const insertionTargets = ['.ph5.pb5', '.ph5', '.mt2.relative', '.pv-text-details__left-panel', '.display-flex.ph5'];

  let inserted = false;
  if (isModernTopCardSection(topCardSection)) {
    const modernInlineTarget = findModernInlineInsertionTarget(topCardSection);
    if (modernInlineTarget) {
      modernInlineTarget.insertAdjacentElement('afterend', card);
      inserted = true;
    }
  }

  for (const selector of insertionTargets) {
    if (inserted) {
      break;
    }

    const target = topCardSection.querySelector(selector);
    if (!target) {
      continue;
    }

    if (selector === '.mt2.relative') {
      target.insertAdjacentElement('afterend', card);
    } else {
      target.appendChild(card);
    }

    inserted = true;
    break;
  }

  if (!inserted) {
    const actionContainer =
      topCardSection.querySelector('.pv-top-card-v2-ctas') ||
      topCardSection.querySelector('.entry-point')?.parentElement;

    if (actionContainer?.parentElement) {
      actionContainer.insertAdjacentElement('afterend', card);
      inserted = true;
    }
  }

  if (!inserted) {
    const modernActionContainer =
      topCardSection.querySelector('a[href*="/preload/custom-invite/"]')?.closest('div[style*="min-width"]') ||
      topCardSection.querySelector('a[href*="/messaging/compose/"]')?.closest('div[style*="min-width"]');

    if (modernActionContainer?.parentElement) {
      modernActionContainer.insertAdjacentElement('afterend', card);
      inserted = true;
    }
  }

  if (!inserted) {
    const modernActionBar = findModernActionBarContainer(topCardSection);
    if (modernActionBar?.parentElement) {
      modernActionBar.insertAdjacentElement('afterend', card);
      inserted = true;
    }
  }

  if (!inserted) {
    topCardSection.appendChild(card);
  }

  feedCardInjected = true;
  clearPendingReinject();
  observeCardRemoval(card);
  setupEventListeners();

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

  if (findProfileTopCardRoot()) {
    injectFeedCard();
    return;
  }

  const observer = new MutationObserver((_mutations, obs) => {
    if (findProfileTopCardRoot()) {
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
