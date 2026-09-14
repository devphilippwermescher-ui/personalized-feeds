import { refreshLinkedInContentRuntime } from './reinject-linkedin-content-runtime';

function isLinkedInUrl(url: string | undefined): boolean {
  if (!url) return false;

  try {
    return new URL(url).hostname === 'www.linkedin.com';
  } catch {
    return false;
  }
}

/**
 * LinkedIn swaps Messaging conversations through History API navigation.
 * Refresh the feature scan on that transition, and restore content.js first
 * when an unpacked-extension Reload invalidated the previous tab context.
 */
export function registerLinkedInContentRuntimeRestoration(): void {
  chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0 || !isLinkedInUrl(details.url)) return;
    void refreshLinkedInContentRuntime(details.tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url || tab.url;
    if (!isLinkedInUrl(url) || (!changeInfo.url && changeInfo.status !== 'complete')) return;
    void refreshLinkedInContentRuntime(tabId);
  });
}
