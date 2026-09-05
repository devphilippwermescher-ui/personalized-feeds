/**
 * Runs through chrome.scripting.executeScript in the extension's isolated
 * world. Imported runtime values are unavailable after Chrome serializes this
 * function, so the registration marker is passed explicitly.
 */
export function refreshContentRuntimeRegistration(marker: string): boolean {
  const runtimeWindow = window as unknown as {
    [key: string]:
      | {
          refresh?: () => void;
        }
      | undefined;
  };
  const registration = runtimeWindow[marker];
  if (typeof registration?.refresh !== 'function') return false;

  try {
    registration.refresh();
    return true;
  } catch {
    return false;
  }
}
