const MIGRATION_MARKER_KEY = 'mfp_independent_sync_migration_v2';
const OBSOLETE_STORAGE_KEYS = [
  'mfp_linkedin_request_scheduler_v1',
  'mfp_linkedin_bootstrap_v3',
  'profileAnalyticsSyncState',
  'mfp_profile_analytics_sync_v1',
] as const;
const OBSOLETE_ALARMS = ['linkedin-bootstrap-retry-v3', 'profile-analytics-safety-sync'] as const;

/** Removes only obsolete global coordination state; domain caches and histories are preserved. */
export async function migrateToIndependentLinkedInSync(): Promise<void> {
  const stored = await chrome.storage.local.get(MIGRATION_MARKER_KEY);
  if (stored[MIGRATION_MARKER_KEY] === true) return;

  await chrome.storage.local.remove([...OBSOLETE_STORAGE_KEYS]);
  if (chrome.alarms?.clear) {
    await Promise.all(OBSOLETE_ALARMS.map((alarmName) => chrome.alarms.clear(alarmName)));
  }
  await chrome.storage.local.set({ [MIGRATION_MARKER_KEY]: true });
}
