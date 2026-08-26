/**
 * Temporary product kill switches for the dormant dashboard.
 *
 * Keep these platform-neutral and shared by the dashboard and extension so a
 * release cannot accidentally expose the UI without its runtime, or keep
 * collecting LinkedIn analytics while the dashboard is hidden. Re-enabling
 * the dashboard later should happen here after plan entitlements are ready.
 */
export const DASHBOARD_ENABLED = false;
export const DASHBOARD_ANALYTICS_SYNC_ENABLED = false;

/**
 * Content Analytics has its own narrower switch so it can be rolled out after
 * the dashboard shell and Profile Analytics are enabled again.
 */
export const CONTENT_ANALYTICS_ENABLED = false;
