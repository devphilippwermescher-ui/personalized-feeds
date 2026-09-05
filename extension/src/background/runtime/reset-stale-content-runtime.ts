/**
 * Runs through chrome.scripting.executeScript in the extension's isolated
 * world. Imported runtime values are unavailable after Chrome serializes this
 * function, so every dependency is passed explicitly.
 */
export function resetStaleContentRuntimeRegistration(marker: string): void {
  const runtimeWindow = window as unknown as Window & {
    [key: string]:
      | {
          dispose?: () => void;
        }
      | undefined;
  };
  const registration = runtimeWindow[marker];

  try {
    registration?.dispose?.();
  } catch {
    // An invalidated extension context can throw while removing listeners.
  }

  delete runtimeWindow[marker];
}
