import { getRelationshipButtonSignal, hasRelationshipSignal } from '../../shared/relationship-dom-signals';

const RELATIONSHIP_ACTION_SELECTOR = 'button, a, [role="button"], [role="menuitem"]';
const EXTENSION_SURFACE_SELECTOR = '#lfa-sidebar, #lfa-sidebar-overlay, [data-pf-feed-card="true"], #pf-feed-card';
const MUTATING_RELATIONSHIP_ACTION_PATTERN =
  /connect|invite|pending|withdraw|follow|unfollow|встановити|контакт|розгляда|скасувати|стежити|відстеж|підпис|подпис|отслеж|отпис/i;

interface ProfileRelationshipObserverOptions {
  debounceMs?: number;
  interactionWindowMs?: number;
  onRelationshipChanged: () => void | Promise<unknown>;
}

function isHidden(element: HTMLElement): boolean {
  if (element.closest('[hidden], [aria-hidden="true"]')) {
    return true;
  }

  const style = window.getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden';
}

function getNativeRelationshipActions(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(RELATIONSHIP_ACTION_SELECTOR)).filter((element) => {
    if (element.closest(EXTENSION_SURFACE_SELECTOR) || isHidden(element)) {
      return false;
    }

    return hasRelationshipSignal(getRelationshipButtonSignal(element));
  });
}

function canMutateRelationship(element: HTMLElement): boolean {
  const { text, label } = getRelationshipButtonSignal(element);
  return MUTATING_RELATIONSHIP_ACTION_PATTERN.test(`${text} ${label}`);
}

function getProfileRelationshipDomState(root: ParentNode): { signature: string; hasActions: boolean } {
  const actions = getNativeRelationshipActions(root);
  const actionSignatures = actions
    .map((action) => {
      const { text, label } = getRelationshipButtonSignal(action);
      return `${text}|${label}`;
    })
    .sort();
  const degree = root.querySelector('.dist-value')?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';

  return {
    signature: `${degree}::${actionSignatures.join('::')}`,
    hasActions: actions.length > 0,
  };
}

export function getProfileRelationshipDomSignature(root: ParentNode): string {
  return getProfileRelationshipDomState(root).signature;
}

export function createProfileRelationshipObserver({
  debounceMs = 1_000,
  interactionWindowMs = 10_000,
  onRelationshipChanged,
}: ProfileRelationshipObserverOptions): {
  observe: (roots: HTMLElement | HTMLElement[]) => void;
  disconnect: () => void;
} {
  let observer: MutationObserver | null = null;
  let pendingTimer: number | null = null;
  let observedRoots: HTMLElement[] = [];
  let lastSignature = '';
  let armedUntil = 0;

  const handleNativeRelationshipClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const action = target.closest<HTMLElement>(RELATIONSHIP_ACTION_SELECTOR);
    if (!action || action.closest(EXTENSION_SURFACE_SELECTOR) || isHidden(action) || !canMutateRelationship(action)) {
      return;
    }

    const isInObservedTopCard = observedRoots.some((root) => root.contains(action));
    const isInVisibleProfileOverlay = Boolean(action.closest('[role="menu"], [role="dialog"]'));
    if (!isInObservedTopCard && !isInVisibleProfileOverlay) {
      return;
    }

    armedUntil = Date.now() + interactionWindowMs;
  };

  const clearPendingTimer = (): void => {
    if (pendingTimer !== null) {
      window.clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };

  const disconnect = (): void => {
    observer?.disconnect();
    observer = null;
    document.removeEventListener('click', handleNativeRelationshipClick, true);
    observedRoots = [];
    lastSignature = '';
    armedUntil = 0;
    clearPendingTimer();
  };

  const scheduleVerification = (): void => {
    const connectedRoots = observedRoots.filter((root) => root.isConnected);
    if (connectedRoots.length === 0) {
      return;
    }

    const nextStates = connectedRoots.map(getProfileRelationshipDomState);
    const nextSignature = nextStates
      .map((state) => state.signature)
      .sort()
      .join('||');
    if (nextSignature === lastSignature) {
      return;
    }

    lastSignature = nextSignature;
    if (!nextStates.some((state) => state.hasActions) || Date.now() > armedUntil) {
      return;
    }

    clearPendingTimer();
    const rootsAtSchedule = connectedRoots;
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null;
      const currentlyConnectedRoots = observedRoots.filter((root) => root.isConnected);
      const stillObservingSameRoots =
        rootsAtSchedule.length === currentlyConnectedRoots.length &&
        rootsAtSchedule.every((root) => currentlyConnectedRoots.includes(root));
      if (!stillObservingSameRoots || !rootsAtSchedule.some((root) => root.isConnected) || Date.now() > armedUntil) {
        return;
      }
      armedUntil = 0;
      void onRelationshipChanged();
    }, debounceMs);
  };

  const observe = (roots: HTMLElement | HTMLElement[]): void => {
    disconnect();
    observedRoots = Array.from(new Set(Array.isArray(roots) ? roots : [roots]));
    // The initial DOM is only the baseline. Opening or reopening a profile must
    // never trigger a relationship request by itself.
    lastSignature = observedRoots.map(getProfileRelationshipDomSignature).sort().join('||');
    document.addEventListener('click', handleNativeRelationshipClick, true);
    observer = new MutationObserver(scheduleVerification);
    observedRoots.forEach((root) => {
      observer?.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'aria-hidden', 'class', 'disabled', 'hidden', 'style', 'title'],
      });
    });
  };

  return { observe, disconnect };
}
