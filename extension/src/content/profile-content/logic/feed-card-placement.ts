import { isProfileToolbarActionElement } from './profile-action-elements';

function getModernProfileActionElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('a, button, [role="button"], [role="menuitem"]')).filter(
    isProfileToolbarActionElement
  );
}

function countModernProfileActionElements(root: ParentNode): number {
  return getModernProfileActionElements(root as HTMLElement).filter((element) => root.contains(element)).length;
}

interface ActionContentBounds {
  left: number;
  bottom: number;
}

function getVisibleActionContentBounds(actionBar: HTMLElement): ActionContentBounds {
  const visibleActionRects = getModernProfileActionElements(actionBar)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 || rect.height > 0);

  if (visibleActionRects.length === 0) {
    const actionBarRect = actionBar.getBoundingClientRect();
    return { left: actionBarRect.left, bottom: actionBarRect.bottom };
  }

  return {
    left: Math.min(...visibleActionRects.map((rect) => rect.left)),
    bottom: Math.max(...visibleActionRects.map((rect) => rect.bottom)),
  };
}

function findFollowingContentTop(card: HTMLElement, boundary: HTMLElement): number | null {
  let current: HTMLElement | null = card;

  while (current && current !== boundary) {
    let sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling instanceof HTMLElement) {
        const rect = sibling.getBoundingClientRect();
        if (rect.height > 0 && rect.top >= card.getBoundingClientRect().bottom) {
          return rect.top;
        }
      }
      sibling = sibling.nextElementSibling;
    }
    current = current.parentElement;
  }

  const boundaryRect = boundary.getBoundingClientRect();
  return boundaryRect.height > 0 ? boundaryRect.bottom : null;
}

function balancePrimaryCardVerticalSpacing(
  card: HTMLElement,
  primaryTopCard: HTMLElement,
  actionBottom: number,
  cardRect: DOMRect
): void {
  const requiredGap = 16;
  const topGap = cardRect.top - actionBottom;
  const currentMarginTop = Number.parseFloat(window.getComputedStyle(card).marginTop) || 0;

  if (topGap < requiredGap) {
    card.style.marginTop = `${currentMarginTop + requiredGap - topGap}px`;
    return;
  }

  const followingContentTop = findFollowingContentTop(card, primaryTopCard);
  if (followingContentTop === null) {
    return;
  }

  const bottomGap = followingContentTop - cardRect.bottom;
  const maxBalanceableGap = 200;
  if (topGap > maxBalanceableGap || bottomGap < 0 || bottomGap > maxBalanceableGap) {
    return;
  }

  const balanceDelta = (bottomGap - topGap) / 2;
  const currentMarginBottom = Number.parseFloat(window.getComputedStyle(card).marginBottom) || 0;
  card.style.marginTop = `${currentMarginTop + balanceDelta}px`;
  card.style.marginBottom = `${currentMarginBottom - balanceDelta}px`;
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

    const cardContainerRect = card.parentElement?.getBoundingClientRect();
    const actionContentBounds = getVisibleActionContentBounds(actionBar);
    const inlineInset = cardContainerRect ? actionContentBounds.left - cardContainerRect.left : Number.NaN;
    if (
      Number.isFinite(inlineInset) &&
      inlineInset >= 0 &&
      (!cardContainerRect || cardContainerRect.width <= 0 || inlineInset < cardContainerRect.width / 3)
    ) {
      card.style.setProperty('--pf-primary-card-inline-inset', `${inlineInset}px`);
    }

    const cardRect = card.getBoundingClientRect();
    balancePrimaryCardVerticalSpacing(card, primaryTopCard, actionContentBounds.bottom, cardRect);
  });
}
