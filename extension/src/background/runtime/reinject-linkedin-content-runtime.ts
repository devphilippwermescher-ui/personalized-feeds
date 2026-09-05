import {
  CONTENT_RUNTIME_REGISTRATION_MARKER,
} from '../../shared/content-runtime';
import { refreshContentRuntimeRegistration } from './refresh-content-runtime-registration';
import { resetStaleContentRuntimeRegistration } from './reset-stale-content-runtime';

const LINKEDIN_TAB_PATTERN = 'https://www.linkedin.com/*';
const CONTENT_RUNTIME_FILE = 'content.js';
const refreshesInFlight = new Map<number, Promise<void>>();

async function refreshActiveContentRuntime(tabId: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: refreshContentRuntimeRegistration,
      args: [CONTENT_RUNTIME_REGISTRATION_MARKER],
    });
    return results.some((result) => result.result === true);
  } catch {
    return false;
  }
}

async function runLinkedInContentRuntimeRefresh(tabId: number): Promise<void> {
  if (await refreshActiveContentRuntime(tabId)) {
    console.debug('[content-runtime] Refreshed LinkedIn UI integrations', { tabId });
    return;
  }

  try {
    // An extension Reload can leave the isolated-world Window alive while its
    // Chrome API context and listeners are invalid. Clear that same-build
    // marker before evaluating content.js again.
    await chrome.scripting.executeScript({
      target: { tabId },
      func: resetStaleContentRuntimeRegistration,
      args: [CONTENT_RUNTIME_REGISTRATION_MARKER],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_RUNTIME_FILE],
    });
    console.info('[content-runtime] Restored LinkedIn UI integrations', { tabId });
  } catch (error) {
    console.warn('[content-runtime] Failed to restore LinkedIn UI integrations', {
      tabId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function refreshLinkedInContentRuntime(tabId: number): Promise<void> {
  const existingRefresh = refreshesInFlight.get(tabId);
  if (existingRefresh) return existingRefresh;

  const refresh = runLinkedInContentRuntimeRefresh(tabId).finally(() => {
    if (refreshesInFlight.get(tabId) === refresh) {
      refreshesInFlight.delete(tabId);
    }
  });
  refreshesInFlight.set(tabId, refresh);
  return refresh;
}

/**
 * Manifest content scripts are not added retroactively to tabs that were open
 * while an unpacked extension was reloaded or a published extension updated.
 * Re-run the idempotent feature runtime so Messaging/Post integrations recover
 * without requiring the user to reload LinkedIn manually.
 */
export async function reinjectLinkedInContentRuntimeIntoOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: LINKEDIN_TAB_PATTERN });

  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map(async (tab) => {
        await refreshLinkedInContentRuntime(tab.id);
      })
  );
}
