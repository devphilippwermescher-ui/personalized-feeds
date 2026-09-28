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

export function insertFeedCardIntoTopCard(card: HTMLElement, topCardSection: HTMLElement): void {
  const insertionTargets = ['.ph5.pb5', '.ph5', '.mt2.relative', '.pv-text-details__left-panel', '.display-flex.ph5'];

  if (isModernTopCardSection(topCardSection)) {
    const modernInlineTarget = findModernInlineInsertionTarget(topCardSection);
    if (modernInlineTarget) {
      modernInlineTarget.insertAdjacentElement('afterend', card);
      return;
    }
  }

  for (const selector of insertionTargets) {
    const target = topCardSection.querySelector(selector);
    if (!target) {
      continue;
    }

    if (selector === '.mt2.relative') {
      target.insertAdjacentElement('afterend', card);
    } else {
      target.appendChild(card);
    }
    return;
  }

  const actionContainer =
    topCardSection.querySelector('.pv-top-card-v2-ctas') || topCardSection.querySelector('.entry-point')?.parentElement;
  if (actionContainer?.parentElement) {
    actionContainer.insertAdjacentElement('afterend', card);
    return;
  }

  const modernActionContainer =
    topCardSection.querySelector('a[href*="/preload/custom-invite/"]')?.closest('div[style*="min-width"]') ||
    topCardSection.querySelector('a[href*="/messaging/compose/"]')?.closest('div[style*="min-width"]');
  if (modernActionContainer?.parentElement) {
    modernActionContainer.insertAdjacentElement('afterend', card);
    return;
  }

  const modernActionBar = findModernActionBarContainer(topCardSection);
  if (modernActionBar?.parentElement) {
    modernActionBar.insertAdjacentElement('afterend', card);
    return;
  }

  topCardSection.appendChild(card);
}

export function insertFeedCardIntoPrimaryTopCard(card: HTMLElement, primaryTopCard: HTMLElement): void {
  const actionBar = findModernActionBarContainer(primaryTopCard);
  card.classList.add('pf-feed-card--primary');
  insertFeedCardIntoTopCard(card, primaryTopCard);

  if (!actionBar) {
    return;
  }

  window.requestAnimationFrame(() => {
    if (!card.isConnected || !actionBar.isConnected) {
      return;
    }

    const actionRect = actionBar.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const requiredGap = 16;
    const overlap = actionRect.bottom + requiredGap - cardRect.top;
    if (overlap <= 0) {
      return;
    }

    const currentMarginTop = Number.parseFloat(window.getComputedStyle(card).marginTop) || 0;
    card.style.marginTop = `${currentMarginTop + overlap}px`;
  });
}
