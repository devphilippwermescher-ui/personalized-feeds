import {
  PROFILE_VIEWERS_BUDGET_CAPACITY,
  PROFILE_VIEWERS_BUDGET_REFILL_MS,
  PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION,
  type ProfileViewersSyncState,
} from './profile-viewers-sync-contracts';

export interface ProfileViewersRequestBudget {
  tokensAvailable: number;
  nextTokenAt?: number;
}

export function getProfileViewersRequestBudget(
  state: ProfileViewersSyncState,
  now: number
): ProfileViewersRequestBudget {
  if (
    typeof state.requestBudgetTokens !== 'number' ||
    !Number.isFinite(state.requestBudgetTokens) ||
    typeof state.requestBudgetUpdatedAt !== 'number' ||
    !Number.isFinite(state.requestBudgetUpdatedAt)
  ) {
    return { tokensAvailable: PROFILE_VIEWERS_BUDGET_CAPACITY };
  }

  const elapsed = Math.max(0, now - state.requestBudgetUpdatedAt);
  const tokensAvailable = Math.min(
    PROFILE_VIEWERS_BUDGET_CAPACITY,
    Math.max(0, state.requestBudgetTokens) + elapsed / PROFILE_VIEWERS_BUDGET_REFILL_MS
  );
  if (tokensAvailable >= PROFILE_VIEWERS_BUDGET_CAPACITY) {
    return { tokensAvailable };
  }

  const nextWholeToken = Math.floor(tokensAvailable) + 1;
  return {
    tokensAvailable,
    nextTokenAt: now + Math.ceil((nextWholeToken - tokensAvailable) * PROFILE_VIEWERS_BUDGET_REFILL_MS),
  };
}

export function getIncompleteProfileViewersImportDueAt(state: ProfileViewersSyncState, now: number): number {
  const budget = getProfileViewersRequestBudget(state, now);
  return budget.tokensAvailable >= 1 ? now + 1_000 : budget.nextTokenAt || now + 1_000;
}

export function canMakeProfileViewersRequest(state: ProfileViewersSyncState, now: number, reserveTokens = 0): boolean {
  return getProfileViewersRequestBudget(state, now).tokensAvailable >= reserveTokens + 1;
}

export function recordProfileViewersRequest(state: ProfileViewersSyncState, now: number): ProfileViewersSyncState {
  const { tokensAvailable } = getProfileViewersRequestBudget(state, now);

  return {
    ...state,
    schedulePolicyVersion: PROFILE_VIEWERS_SCHEDULE_POLICY_VERSION,
    requestBudgetTokens: Math.max(0, tokensAvailable - 1),
    requestBudgetUpdatedAt: now,
    requestWindowStartedAt: undefined,
    requestCountInWindow: undefined,
    updatedAt: now,
  };
}

