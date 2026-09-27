const FEEDS_USER_INFO_STORAGE_KEY = 'feedsUserInfo';

interface ExtensionAuthStateResponse {
  isAuthenticated?: boolean;
}

function isAuthenticated(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (value as ExtensionAuthStateResponse).isAuthenticated === true;
}

export function loadExtensionAuthState(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'FEEDS_GET_AUTH_STATE' }, (response: unknown) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(isAuthenticated(response));
      });
    } catch {
      resolve(false);
    }
  });
}

export function onExtensionAuthStateChange(callback: (authenticated: boolean) => void): () => void {
  let disposed = false;
  let storageRevision = 0;

  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
    if (areaName !== 'local' || !changes[FEEDS_USER_INFO_STORAGE_KEY]) return;

    storageRevision += 1;
    callback(isAuthenticated(changes[FEEDS_USER_INFO_STORAGE_KEY].newValue));
  };

  chrome.storage.onChanged.addListener(listener);

  const initialRevision = storageRevision;
  void loadExtensionAuthState().then((authenticated) => {
    if (!disposed && storageRevision === initialRevision) {
      callback(authenticated);
    }
  });

  return () => {
    disposed = true;
    chrome.storage.onChanged.removeListener(listener);
  };
}
