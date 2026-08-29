interface PlanStarIconOptions {
  className?: string;
}

/** Shared Pro-plan mark used by the account menu and plan modal. */
export function renderPlanStarIcon({ className = '' }: PlanStarIconOptions = {}): string {
  return `<span class="${className}" aria-hidden="true">★</span>`;
}
