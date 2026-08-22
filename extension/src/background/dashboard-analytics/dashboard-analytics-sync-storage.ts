import {
  createProfileAnalyticsSyncState,
  type ProfileAnalyticsSyncState,
} from '../profile-analytics-sync-policy';
import {
  getStoredProfileAnalyticsSyncState,
  setStoredProfileAnalyticsSyncState,
} from '../profile-analytics-sync-runtime';
import {
  migrateToDashboardAnalyticsSyncState,
  type DashboardAnalyticsSyncState,
} from './dashboard-analytics-sync-policy';

/**
 * Dashboard Analytics persists into the existing Profile Analytics record.
 *
 * Reusing the key is deliberate: an extension upgrade must not reset request
 * budgets, retry timers, or the resumable connection-history checkpoint. The
 * content sub-state is added in place by the migration below.
 */
export async function getStoredDashboardAnalyticsSyncState(
  userId?: string
): Promise<DashboardAnalyticsSyncState | undefined> {
  const stored = await getStoredProfileAnalyticsSyncState(userId);
  return stored ? migrateToDashboardAnalyticsSyncState(stored) : undefined;
}

export function setStoredDashboardAnalyticsSyncState(state: DashboardAnalyticsSyncState): Promise<void> {
  return setStoredProfileAnalyticsSyncState(state as ProfileAnalyticsSyncState);
}

export function createDashboardAnalyticsSyncState(userId: string): DashboardAnalyticsSyncState {
  return migrateToDashboardAnalyticsSyncState(createProfileAnalyticsSyncState(userId));
}

export async function loadDashboardAnalyticsSyncState(userId: string): Promise<DashboardAnalyticsSyncState> {
  return (await getStoredDashboardAnalyticsSyncState(userId)) || createDashboardAnalyticsSyncState(userId);
}
