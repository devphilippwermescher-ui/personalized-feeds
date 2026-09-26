type LinkedInTab = chrome.tabs.Tab & { id: number };

function isSsiPage(tab: LinkedInTab): boolean {
  try {
    return new URL(tab.url || '').pathname.startsWith('/sales/ssi');
  } catch {
    return false;
  }
}

/**
 * Returns existing, loaded LinkedIn tabs in execution priority order.
 * No tab is activated, navigated, or created by this selector.
 */
export function selectLinkedInExecutionTabs(tabs: chrome.tabs.Tab[], preferredTabId?: number): LinkedInTab[] {
  return tabs
    .filter((tab): tab is LinkedInTab => {
      if (typeof tab.id !== 'number' || tab.discarded === true) return false;
      // A content-script activity event can arrive while Chrome still reports
      // the preferred tab as loading. Its document is already executable and
      // must not be replaced with an older unresponsive tab.
      return tab.status === 'complete' || tab.active === true || tab.id === preferredTabId;
    })
    .sort((left, right) => {
      const leftPreferred = left.id === preferredTabId ? 1 : 0;
      const rightPreferred = right.id === preferredTabId ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;

      const leftActive = left.active ? 1 : 0;
      const rightActive = right.active ? 1 : 0;
      if (leftActive !== rightActive) return rightActive - leftActive;

      const leftComplete = left.status === 'complete' ? 1 : 0;
      const rightComplete = right.status === 'complete' ? 1 : 0;
      if (leftComplete !== rightComplete) return rightComplete - leftComplete;

      const leftRegularPage = isSsiPage(left) ? 0 : 1;
      const rightRegularPage = isSsiPage(right) ? 0 : 1;
      if (leftRegularPage !== rightRegularPage) return rightRegularPage - leftRegularPage;

      const lastAccessDifference = (right.lastAccessed || 0) - (left.lastAccessed || 0);
      if (lastAccessDifference !== 0) return lastAccessDifference;
      return right.id - left.id;
    });
}
