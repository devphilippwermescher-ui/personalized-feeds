import {
  getRelationshipButtonSignal,
  hasRelationshipSignal,
} from './relationship-dom-signals';

const PROFILE_CARD_SELECTORS = [
  'section[componentkey*="Topcard"]',
  'section[componentkey*="topcard"]',
  '.pv-top-card',
  'section[data-member-id]',
  '.ph5.pb5',
].join(', ');

const RELATIONSHIP_ACTION_SELECTOR = 'button, a, [role="button"], [role="menuitem"]';
const OPEN_MENU_ACTION_SELECTOR =
  '[role="menu"] button, [role="menu"] a, [role="menuitem"], .artdeco-dropdown__content button, .artdeco-dropdown__content a';

function normalizeLinkedInUsername(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const normalized = value.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function getCurrentProfileUsername(): string {
  const match = window.location.pathname.match(/^\/in\/([^/]+)/);
  return normalizeLinkedInUsername(match?.[1]);
}

function getUsernameFromHref(value: string | null): string {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value, window.location.origin);
    const match = url.pathname.match(/^\/in\/([^/]+)/);
    return normalizeLinkedInUsername(match?.[1]);
  } catch {
    return '';
  }
}

function normalizeComparableName(value: string | undefined): string {
  return (value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[·•]\s*(?:1st|2nd|3rd\+?|3rd|1-й|2-й|3-й)\s*$/i, '')
    .trim()
    .toLowerCase();
}

function getScopedRelationshipActions(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(RELATIONSHIP_ACTION_SELECTOR)).filter((element) =>
    hasRelationshipSignal(getRelationshipButtonSignal(element))
  );
}

function getCandidateScore(
  candidate: HTMLElement,
  username: string,
  displayName: string
): number {
  const actions = getScopedRelationshipActions(candidate);
  if (actions.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = Math.min(actions.length, 4) * 10;
  const componentKey = candidate.getAttribute('componentkey') || '';
  if (/topcard/i.test(componentKey)) score += 50;
  if (candidate.matches('.pv-top-card')) score += 45;
  if (candidate.querySelector('h1')) score += 60;
  else if (candidate.querySelector('h2')) score += 20;

  if (username) {
    const hasExactProfileLink = Array.from(candidate.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'))
      .some((link) => getUsernameFromHref(link.getAttribute('href')) === username);
    if (hasExactProfileLink) score += 100;
  }

  if (displayName) {
    const headingName = normalizeComparableName(candidate.querySelector('h1, h2')?.textContent || '');
    if (headingName === displayName) score += 80;
  }

  return score;
}

/**
 * Finds the relationship action card for the profile represented by the current /in/ route.
 * LinkedIn can render several profile-like sections on one page, so callers must not rely on
 * the first broad `section[data-member-id]` match.
 */
export function findCurrentProfileRelationshipRoot(options: {
  username?: string;
  displayName?: string;
} = {}): HTMLElement | null {
  const username = normalizeLinkedInUsername(options.username) || getCurrentProfileUsername();
  const displayName = normalizeComparableName(options.displayName);
  const directCandidates = Array.from(document.querySelectorAll<HTMLElement>(PROFILE_CARD_SELECTORS));
  const headingCandidates = Array.from(document.querySelectorAll<HTMLElement>('h1, h2'))
    .map((heading) => {
      let current: HTMLElement | null = heading.parentElement;
      let depth = 0;
      while (current && current !== document.body && depth < 8) {
        if (getScopedRelationshipActions(current).length >= 2) {
          return current;
        }
        current = current.parentElement;
        depth += 1;
      }
      return null;
    })
    .filter((candidate): candidate is HTMLElement => Boolean(candidate));

  let bestCandidate: HTMLElement | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of Array.from(new Set([...directCandidates, ...headingCandidates]))) {
    const score = getCandidateScore(candidate, username, displayName);
    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestCandidate;
}

export function getCurrentProfileRelationshipActions(scope: ParentNode): HTMLElement[] {
  const scopedActions = getScopedRelationshipActions(scope);
  const menuActions = Array.from(document.querySelectorAll<HTMLElement>(OPEN_MENU_ACTION_SELECTOR)).filter(
    (element) => hasRelationshipSignal(getRelationshipButtonSignal(element))
  );
  return Array.from(new Set([...scopedActions, ...menuActions]));
}
