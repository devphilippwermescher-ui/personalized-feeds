import { getRelationshipButtonSignal, hasRelationshipSignal } from '../../shared/relationship-dom-signals';

export function isProfileRelationshipActionElement(element: Element): boolean {
  const href = element.getAttribute('href') || '';
  return (
    /\/(?:messaging\/compose|preload\/custom-invite)\//i.test(href) ||
    hasRelationshipSignal(getRelationshipButtonSignal(element))
  );
}

export function isProfileToolbarActionElement(element: HTMLElement): boolean {
  if (isProfileRelationshipActionElement(element)) {
    return true;
  }

  return Boolean(
    element.matches('button[aria-expanded]') && element.querySelector('svg[id*="overflow" i], use[href*="overflow" i]')
  );
}
