interface PlanStarIconOptions {
  className?: string;
}

/** Shared Pro-plan mark used by the account menu and plan modal. */
export function renderPlanStarIcon({ className = '' }: PlanStarIconOptions = {}): string {
  return `<span class="${className}" aria-hidden="true">★</span>`;
}

export function renderPlanOutlineStarIcon({ className = '' }: PlanStarIconOptions = {}): string {
  return `
    <svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m12 2.7 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9L12 2.7Z"></path>
    </svg>
  `;
}
